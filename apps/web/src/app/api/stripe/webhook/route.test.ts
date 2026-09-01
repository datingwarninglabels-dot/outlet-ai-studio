import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked for the same "no live DB/Stripe account in this environment"
// reason as every other test in this project. @/lib/stripe is mocked
// wholesale (not the raw `stripe` package) since the route only ever
// talks to Stripe through that module.
const selectMock = vi.fn();
const insertValuesMock = vi.fn();
const onConflictDoUpdateMock = vi.fn();
const updateSetWhereMock = vi.fn();
const updateSetMock = vi.fn(() => ({ where: updateSetWhereMock }));

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
    insert: vi.fn(() => ({ values: insertValuesMock })),
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

beforeEach(() => {
  vi.clearAllMocks();
  isStripeConfiguredMock.mockReturnValue(true);
  getPlanIdForStripePriceIdMock.mockReturnValue("pro");
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  insertValuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
  onConflictDoUpdateMock.mockResolvedValue(undefined);
  updateSetWhereMock.mockResolvedValue(undefined);
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

describe("POST /api/stripe/webhook — checkout.session.completed", () => {
  it("retrieves the full subscription and upserts it", async () => {
    const subscription = makeSubscription();
    retrieveSubscriptionMock.mockResolvedValue(subscription);
    constructEventMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", subscription: "sub_123" } },
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(retrieveSubscriptionMock).toHaveBeenCalledWith("sub_123");
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1", plan: "pro", status: "active", stripeSubscriptionId: "sub_123" }),
    );
  });

  it("ignores a completed checkout that isn't a subscription (e.g. a one-time payment mode)", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", subscription: null } },
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(retrieveSubscriptionMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — subscription lifecycle events", () => {
  it("customer.subscription.updated upserts plan/status/period directly from the event", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: { object: makeSubscription({ status: "past_due" }) },
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ status: "past_due", ownerId: "owner-1" }));
  });

  it("customer.subscription.deleted resets the account to free", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: { object: makeSubscription({ status: "canceled" }) },
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ plan: "free", status: "canceled" }));
  });

  it("an unrecognized Price ID falls back to plan 'free' rather than granting an unidentifiable plan", async () => {
    getPlanIdForStripePriceIdMock.mockReturnValue(null as unknown as "pro");
    constructEventMock.mockReturnValue({
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: makeSubscription() },
    });

    await POST(makeRequest("{}"));

    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ plan: "free" }));
  });
});

describe("POST /api/stripe/webhook — owner resolution and error handling", () => {
  it("skips writing anything if the owner can't be resolved (no metadata, no matching customer), but still returns 200", async () => {
    selectMock.mockReturnValue({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) });
    constructEventMock.mockReturnValue({
      id: "evt_5",
      type: "customer.subscription.updated",
      data: { object: makeSubscription({ metadata: {} }) },
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("falls back to looking up the owner by stripeCustomerId when subscription metadata has none", async () => {
    selectMock.mockReturnValue({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ ownerId: "owner-2" }]) }) }) });
    constructEventMock.mockReturnValue({
      id: "evt_6",
      type: "customer.subscription.updated",
      data: { object: makeSubscription({ metadata: {} }) },
    });

    await POST(makeRequest("{}"));

    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-2" }));
  });

  it("returns 500 (so Stripe retries) if handling the event throws", async () => {
    insertValuesMock.mockImplementation(() => {
      throw new Error("db unavailable");
    });
    constructEventMock.mockReturnValue({
      id: "evt_7",
      type: "customer.subscription.updated",
      data: { object: makeSubscription() },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(500);
  });

  it("returns 200 for an event type it doesn't handle, without touching the database", async () => {
    constructEventMock.mockReturnValue({ id: "evt_8", type: "invoice.paid", data: { object: {} } });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(updateSetWhereMock).not.toHaveBeenCalled();
  });
});
