import { beforeEach, describe, expect, it, vi } from "vitest";
import { stripeWebhookEvents } from "@/db/schema";

// Mocked for the same "no live DB/Stripe account in this environment"
// reason as every other test in this project. @/lib/stripe is mocked
// wholesale (not the raw `stripe` package) since the route only ever
// talks to Stripe through that module.
//
// Three logically distinct `db.select()` call sites now share this file's
// mock: the event-id dedup check (`stripeWebhookEvents`, selects `id`),
// the staleness guard inside upsertSubscriptionFromStripe/
// handleSubscriptionDeleted (`subscriptions`, selects
// `lastStripeEventCreatedAt`), and resolveOwnerId's stripeCustomerId
// fallback lookup (`subscriptions`, selects `ownerId`). Distinguished by
// inspecting the columns object each call passes to `.select(...)` — not
// by call order — so adding/reordering a call site elsewhere can't
// silently make a test start asserting against the wrong select.
let dedupSelectResult: unknown[] = [];
let staleSelectResult: unknown[] = [];
let ownerSelectResult: unknown[] = [];

const selectMock = vi.fn((columns: Record<string, unknown>) => {
  const key = Object.keys(columns)[0];
  const result = key === "id" ? dedupSelectResult : key === "lastStripeEventCreatedAt" ? staleSelectResult : ownerSelectResult;
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(result) }) }) };
});

// Subscriptions-table insert (the real state-changing write) and the
// webhook-events-table insert (the "mark as processed" bookkeeping write
// at the end of a successful request) are mocked separately, keyed by
// which table `.insert(...)` was called with — a shared generic mock would
// make "no insert happened" assertions fail the moment the harmless
// bookkeeping insert exists at all, even when the real write correctly
// never happened.
const insertValuesMock = vi.fn();
const onConflictDoUpdateMock = vi.fn();
const webhookEventInsertValuesMock = vi.fn();
const webhookEventOnConflictDoNothingMock = vi.fn();
const updateSetWhereMock = vi.fn();
const updateSetMock = vi.fn(() => ({ where: updateSetWhereMock }));

const insertMock = vi.fn((table: unknown) => {
  if (table === stripeWebhookEvents) {
    return { values: webhookEventInsertValuesMock };
  }
  return { values: insertValuesMock };
});

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    update: vi.fn(() => ({ set: updateSetMock })),
  },
}));

const constructEventMock = vi.fn();
const retrieveSubscriptionMock = vi.fn();
const isStripeConfiguredMock = vi.fn(() => true);
const getPlanIdForStripePriceIdMock = vi.fn(() => "pro" as const);

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: isStripeConfiguredMock,
  getStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: retrieveSubscriptionMock },
  }),
  getPlanIdForStripePriceId: getPlanIdForStripePriceIdMock,
}));

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string> = { "stripe-signature": "sig_test" }): Request {
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", headers, body });
}

// Unix seconds — arbitrary but fixed, matching this file's existing
// current_period_start/end fixtures, with room above/below for tests that
// need to construct an intentionally older or newer event.
const EVENT_CREATED = 1700000050;

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { ownerId: "owner-1" },
    items: {
      data: [
        {
          price: { id: "price_pro" },
          current_period_start: 1700000000,
          current_period_end: 1702592000,
        },
      ],
    },
    ...overrides,
  };
}

/** Every real event this route receives carries `created` — tests that
 * don't care about its exact value still need a valid one, since it's used
 * to populate subscriptions.lastStripeEventCreatedAt. */
function makeEvent(overrides: Record<string, unknown>) {
  return { created: EVENT_CREATED, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  isStripeConfiguredMock.mockReturnValue(true);
  getPlanIdForStripePriceIdMock.mockReturnValue("pro");
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  dedupSelectResult = []; // not a duplicate by default
  staleSelectResult = []; // no existing row / nothing to compare against by default
  ownerSelectResult = []; // resolveOwnerId's fallback finds nothing by default
  insertValuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
  onConflictDoUpdateMock.mockResolvedValue(undefined);
  updateSetWhereMock.mockResolvedValue(undefined);
  webhookEventInsertValuesMock.mockReturnValue({ onConflictDoNothing: webhookEventOnConflictDoNothingMock });
  webhookEventOnConflictDoNothingMock.mockResolvedValue(undefined);
});

describe("POST /api/stripe/webhook — request-level guards", () => {
  it("returns 500 without touching Stripe if not configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(500);
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("returns 500 if STRIPE_WEBHOOK_SECRET is unset even though the client is configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(500);
  });

  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = await POST(makeRequest("{}", {}));
    expect(res.status).toBe(400);
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when signature verification fails, without processing the event", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — event deduplication", () => {
  it("skips processing entirely and returns 200 when this event id was already handled", async () => {
    dedupSelectResult = [{ id: "evt_dup" }];
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_dup", type: "customer.subscription.updated", data: { object: makeSubscription() } }),
    );

    const res = await POST(makeRequest("{}"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    // Neither the real write nor a fresh Stripe subscription fetch happened.
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(retrieveSubscriptionMock).not.toHaveBeenCalled();
  });

  it("records the event id as processed only after a successful handle, never before", async () => {
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_new", type: "customer.subscription.updated", data: { object: makeSubscription() } }),
    );

    await POST(makeRequest("{}"));

    expect(webhookEventInsertValuesMock).toHaveBeenCalledWith({ id: "evt_new", type: "customer.subscription.updated" });
  });

  it("does NOT record the event as processed if handling it throws (so a retry actually reprocesses it)", async () => {
    insertValuesMock.mockImplementation(() => {
      throw new Error("db unavailable");
    });
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_fail", type: "customer.subscription.updated", data: { object: makeSubscription() } }),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(500);
    expect(webhookEventInsertValuesMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — stale/out-of-order event protection", () => {
  it("ignores an incoming event no newer than the one already applied to this subscription", async () => {
    staleSelectResult = [{ lastStripeEventCreatedAt: new Date((EVENT_CREATED + 1000) * 1000) }];
    constructEventMock.mockReturnValue(
      makeEvent({
        id: "evt_stale",
        type: "customer.subscription.updated",
        data: { object: makeSubscription({ status: "canceled" }) },
        created: EVENT_CREATED, // older than the already-applied EVENT_CREATED + 1000
      }),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    // The stale write never happened — no attempt to overwrite the newer
    // state with this older event's data.
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("applies an incoming event newer than the one already applied", async () => {
    staleSelectResult = [{ lastStripeEventCreatedAt: new Date((EVENT_CREATED - 1000) * 1000) }];
    constructEventMock.mockReturnValue(
      makeEvent({
        id: "evt_fresh",
        type: "customer.subscription.updated",
        data: { object: makeSubscription({ status: "canceled" }) },
        created: EVENT_CREATED,
      }),
    );

    await POST(makeRequest("{}"));

    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled" }));
  });
});

describe("POST /api/stripe/webhook — checkout.session.completed", () => {
  it("retrieves the full subscription and upserts it", async () => {
    const subscription = makeSubscription();
    retrieveSubscriptionMock.mockResolvedValue(subscription);
    constructEventMock.mockReturnValue(
      makeEvent({
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { mode: "subscription", subscription: "sub_123" } },
      }),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(retrieveSubscriptionMock).toHaveBeenCalledWith("sub_123");
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1", plan: "pro", status: "active", stripeSubscriptionId: "sub_123" }),
    );
  });

  it("ignores a completed checkout that isn't a subscription (e.g. a one-time payment mode)", async () => {
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "payment", subscription: null } } }),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(retrieveSubscriptionMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — subscription lifecycle events", () => {
  it("customer.subscription.updated upserts plan/status/period directly from the event", async () => {
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_2", type: "customer.subscription.updated", data: { object: makeSubscription({ status: "past_due" }) } }),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ status: "past_due", ownerId: "owner-1" }));
  });

  it("customer.subscription.deleted resets the account to free", async () => {
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_3", type: "customer.subscription.deleted", data: { object: makeSubscription({ status: "canceled" }) } }),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ plan: "free", status: "canceled" }));
  });

  it("an unrecognized Price ID falls back to plan 'free' rather than granting an unidentifiable plan", async () => {
    getPlanIdForStripePriceIdMock.mockReturnValue(null as unknown as "pro");
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_4", type: "customer.subscription.updated", data: { object: makeSubscription() } }),
    );

    await POST(makeRequest("{}"));

    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ plan: "free" }));
  });
});

describe("POST /api/stripe/webhook — owner resolution and error handling", () => {
  it("skips writing anything if the owner can't be resolved (no metadata, no matching customer), but still returns 200", async () => {
    ownerSelectResult = [];
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_5", type: "customer.subscription.updated", data: { object: makeSubscription({ metadata: {} }) } }),
    );

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("falls back to looking up the owner by stripeCustomerId when subscription metadata has none", async () => {
    ownerSelectResult = [{ ownerId: "owner-2" }];
    constructEventMock.mockReturnValue(
      makeEvent({ id: "evt_6", type: "customer.subscription.updated", data: { object: makeSubscription({ metadata: {} }) } }),
    );

    await POST(makeRequest("{}"));

    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-2" }));
  });

  it("returns 500 (so Stripe retries) if handling the event throws", async () => {
    insertValuesMock.mockImplementation(() => {
      throw new Error("db unavailable");
    });
    constructEventMock.mockReturnValue(makeEvent({ id: "evt_7", type: "customer.subscription.updated", data: { object: makeSubscription() } }));

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(500);
  });

  it("returns 200 for an event type it doesn't handle, without touching the database", async () => {
    constructEventMock.mockReturnValue(makeEvent({ id: "evt_8", type: "invoice.paid", data: { object: {} } }));
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(updateSetWhereMock).not.toHaveBeenCalled();
  });
});

