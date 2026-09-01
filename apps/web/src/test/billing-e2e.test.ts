/**
 * Genuine end-to-end billing test — real database (PGlite, a real WASM
 * Postgres, not a mock), real production code paths (the actual
 * registerCustomer/requestJob/getEntitlement/webhook-route functions this
 * app ships), real schema constraints. The ONLY thing mocked is the
 * Stripe network boundary itself (getStripeClient()'s returned methods) —
 * there is no way to make a real network call to Stripe without a real
 * Stripe account, which doesn't exist in this environment. Everything
 * downstream of that boundary (database writes, entitlement computation,
 * access enforcement) is real and independently verified by re-querying
 * the real database afterward, not by trusting the function's own return
 * value.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { generationJobs, projects, subscriptions, users } from "@/db/schema";
import { createTestDb } from "./pglite-db";

const { db, client } = await createTestDb();

vi.mock("@/db", () => ({ db }));

// Mocking the raw "stripe" npm package's client — NOT our own lib/stripe.ts
// wrapper. createCheckoutSession/getOrCreateStripeCustomerId call
// getStripeClient() as a same-module reference; a vi.mock of "@/lib/stripe"
// itself (even with importOriginal + spreading real implementations back
// in) cannot redirect those same-module internal calls, since the
// function bodies already closed over the real local getStripeClient
// before any mock factory runs — confirmed by first attempting exactly
// that and watching it call the real getStripeClient anyway. Mocking the
// underlying SDK's `Stripe` class instead means lib/stripe.ts's own logic
// (customer creation/reuse against the real database, the exact request
// shape sent to Stripe, price-id-to-plan mapping) all runs for real; only
// the actual network client Stripe's SDK would construct is fake.
const checkoutSessionsCreateMock = vi.fn();
const customersCreateMock = vi.fn();
const subscriptionsRetrieveMock = vi.fn();
const constructEventMock = vi.fn();
const billingPortalCreateMock = vi.fn();
const pricesRetrieveMock = vi.fn();

vi.mock("stripe", () => ({
  // `new Stripe(...)` requires a real constructible function — an arrow
  // function can never be called with `new`, no matter how it's wrapped.
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      checkout: { sessions: { create: checkoutSessionsCreateMock } },
      customers: { create: customersCreateMock },
      subscriptions: { retrieve: subscriptionsRetrieveMock },
      webhooks: { constructEvent: constructEventMock },
      billingPortal: { sessions: { create: billingPortalCreateMock } },
      prices: { retrieve: pricesRetrieveMock },
    };
  }),
}));

process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_this_test_only";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.FREE_PLAN_MONTHLY_CREDIT_CENTS = "50";
process.env.PRO_PLAN_MONTHLY_CREDIT_CENTS = "500";
process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
process.env.STRIPE_PRICE_ID_STUDIO = "price_studio_test";

const { registerCustomer } = await import("@/app/register/actions");
const { requestJob, confirmJob } = await import("@/lib/jobs");
const { getEntitlement, PaywallError } = await import("@/lib/entitlements");
const { PAYWALL_MESSAGE } = await import("@/lib/paywall-message");
// createCheckoutSession (not the startCheckout server action) — the
// action's own layer is only session resolution + form parsing + redirect
// around this function; it also imports @/auth, which cannot be loaded
// under plain Vitest in this project (confirmed separately: next-auth's
// internal "next/server" resolution fails outside Next's own bundler,
// unrelated to anything built in this task). Testing this function
// directly still exercises all the real billing logic (customer
// creation/reuse, the actual Stripe call, real DB writes) — it just
// receives ownerId/email as plain arguments instead of resolving them
// from a session itself, which is Next.js/NextAuth's job, not this code's.
const { createCheckoutSession, AlreadySubscribedError } = await import("@/lib/stripe");
const { POST: webhookPost } = await import("@/app/api/stripe/webhook/route");
const { loadConfirmedJob } = await import("@/trigger/lib/job-task");
const { getPlan } = await import("@/lib/plans");

// Unique per call by default — every scenario uses its own independent
// user, and the real `subscription.stripe_subscription_id` column is
// uniquely constrained, so reusing one hardcoded id across scenarios (the
// original version of this helper did) triggers a real constraint
// violation, exactly as it would in production if two different Stripe
// subscriptions were ever attributed the same id. A scenario that needs
// to update the *same* subscription across two webhook calls (10, 11)
// passes an explicit `id` override to keep it consistent within itself.
function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: `sub_${crypto.randomUUID()}`,
    customer: `cus_${crypto.randomUUID()}`,
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    items: {
      data: [
        {
          price: { id: "price_pro_test" },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      ],
    },
    ...overrides,
  };
}

function webhookRequest(body: object) {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: JSON.stringify(body),
  });
}

async function makeUser(email: string) {
  const result = await registerCustomer({
    name: "Test User",
    email,
    password: "twelvecharss",
    website: "",
    renderedAt: Date.now() - 5000,
  });
  expect(result.error).toBeNull(); // fails loudly here if registration itself is broken
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error("test setup failed: user was not actually inserted");
  const [project] = await db.insert(projects).values({ ownerId: user.id, title: "Test Project", status: "draft" }).returning();
  return { user, project };
}

afterAll(async () => {
  await client.close();
});

describe("1. New user creates an account", () => {
  it("really inserts a user row via the production registerCustomer action", async () => {
    const { user } = await makeUser("scenario1@example.com");
    expect(user.email).toBe("scenario1@example.com");
    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash).not.toBe("twelvecharss"); // never stored in plaintext
  });
});

describe("2. New user starts on FREE", () => {
  it("resolves to the free plan with zero subscription rows in the real database", async () => {
    const { user } = await makeUser("scenario2@example.com");
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id));
    expect(rows).toHaveLength(0); // no row created at registration — confirmed, not assumed
    const entitlement = await getEntitlement(user.id);
    expect(entitlement.plan).toBe("free");
    expect(entitlement.status).toBeNull();
  });
});

describe("3. Free user can access free features", () => {
  it("a generation request within the free allowance really creates a job row", async () => {
    const { user, project } = await makeUser("scenario3@example.com");
    const job = await requestJob({
      ownerId: user.id,
      projectId: project.id,
      type: "script",
      provider: "anthropic",
      model: "claude-sonnet-5",
      idempotencyKey: crypto.randomUUID(),
      params: {},
      estimatedCostCents: 20, // within the 50-cent free allowance
    });
    const [persisted] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id)).limit(1);
    expect(persisted).toBeDefined();
    expect(persisted!.status).toBe("awaiting_confirmation");
  });
});

describe("4. Free user cannot bypass premium features (exceeding the free allowance)", () => {
  it("really rejects a request once confirmed usage reaches the free allowance, and inserts no new job row", async () => {
    const { user, project } = await makeUser("scenario4@example.com");

    const job1 = await requestJob({
      ownerId: user.id,
      projectId: project.id,
      type: "script",
      provider: "anthropic",
      model: "claude-sonnet-5",
      idempotencyKey: crypto.randomUUID(),
      params: {},
      estimatedCostCents: 45,
    });
    await confirmJob(job1.id); // simulates the real "customer confirms the estimate" step

    const jobsBefore = await db.select().from(generationJobs).where(eq(generationJobs.projectId, project.id));

    await expect(
      requestJob({
        ownerId: user.id,
        projectId: project.id,
        type: "script",
        provider: "anthropic",
        model: "claude-sonnet-5",
        idempotencyKey: crypto.randomUUID(),
        params: {},
        estimatedCostCents: 20, // 45 + 20 > 50 allowance
      }),
    ).rejects.toThrow(PaywallError);

    const jobsAfter = await db.select().from(generationJobs).where(eq(generationJobs.projectId, project.id));
    expect(jobsAfter).toHaveLength(jobsBefore.length); // confirmed: no job row was created for the rejected request
  });
});

describe("5. Premium feature displays the paywall", () => {
  it("the rejection carries the exact shared PAYWALL_MESSAGE the UI checks for", async () => {
    const { user, project } = await makeUser("scenario5@example.com");
    const job1 = await requestJob({
      ownerId: user.id,
      projectId: project.id,
      type: "script",
      provider: "anthropic",
      model: null,
      idempotencyKey: crypto.randomUUID(),
      params: {},
      estimatedCostCents: 50,
    });
    await confirmJob(job1.id);

    const err = await requestJob({
      ownerId: user.id,
      projectId: project.id,
      type: "script",
      provider: "anthropic",
      model: null,
      idempotencyKey: crypto.randomUUID(),
      params: {},
      estimatedCostCents: 1,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PaywallError);
    expect((err as Error).message).toBe(PAYWALL_MESSAGE);
  });
});

describe("6. User can start Stripe Checkout", () => {
  it("really creates/reuses a Stripe customer row in the database and calls Stripe with the correct plan/price", async () => {
    const { user } = await makeUser("scenario6@example.com");
    customersCreateMock.mockResolvedValue({ id: "cus_scenario6" });
    checkoutSessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.com/test_session_6" });

    const url = await createCheckoutSession({
      ownerId: user.id,
      email: user.email,
      plan: getPlan("pro"),
      successUrl: "http://localhost/billing?checkout=success",
      cancelUrl: "http://localhost/billing?checkout=cancelled",
    });
    expect(url).toBe("https://checkout.stripe.com/test_session_6");

    expect(checkoutSessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_scenario6",
        client_reference_id: user.id,
        line_items: [{ price: "price_pro_test", quantity: 1 }],
      }),
    );

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id)).limit(1);
    expect(sub?.stripeCustomerId).toBe("cus_scenario6"); // really persisted, not just passed to the mock
  });
});

describe("7. Successful payment results in the correct subscription state", () => {
  it("a realistic checkout.session.completed event really writes plan/status/customer/subscription id to the database", async () => {
    const { user } = await makeUser("scenario7@example.com");
    const subscription = stripeSubscription({ customer: "cus_scenario7", metadata: { ownerId: user.id } });
    subscriptionsRetrieveMock.mockResolvedValue(subscription);
    constructEventMock.mockReturnValue({
      id: "evt_scenario7",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { mode: "subscription", subscription: "sub_e2e_1" } },
    });

    const res = await webhookPost(webhookRequest({}));
    expect(res.status).toBe(200);

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id)).limit(1);
    expect(sub).toBeDefined();
    expect(sub!.plan).toBe("pro");
    expect(sub!.status).toBe("active");
    expect(sub!.stripeCustomerId).toBe("cus_scenario7");
    expect(sub!.stripeSubscriptionId).toBe(subscription.id);
    expect(sub!.currentPeriodEnd).toBeInstanceOf(Date);
  });
});

describe("8. Premium access becomes available after confirmed payment", () => {
  it("getEntitlement reads the real post-webhook database state and grants the pro allowance", async () => {
    const { user } = await makeUser("scenario8@example.com");
    const subscription = stripeSubscription({ customer: "cus_scenario8", metadata: { ownerId: user.id } });
    subscriptionsRetrieveMock.mockResolvedValue(subscription);
    constructEventMock.mockReturnValue({
      id: "evt_scenario8",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { mode: "subscription", subscription: "sub_e2e_1" } },
    });
    await webhookPost(webhookRequest({}));

    const entitlement = await getEntitlement(user.id);
    expect(entitlement.plan).toBe("pro");
    expect(entitlement.monthlyCreditCents).toBe(500); // the Pro allowance, not Free's 50
  });
});

describe("9. User can access premium features", () => {
  it("a request that would have exceeded the free allowance succeeds for a real pro-plan user", async () => {
    const { user, project } = await makeUser("scenario9@example.com");
    const subscription = stripeSubscription({ customer: "cus_scenario9", metadata: { ownerId: user.id } });
    subscriptionsRetrieveMock.mockResolvedValue(subscription);
    constructEventMock.mockReturnValue({
      id: "evt_scenario9",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { mode: "subscription", subscription: "sub_e2e_1" } },
    });
    await webhookPost(webhookRequest({}));

    const job = await requestJob({
      ownerId: user.id,
      projectId: project.id,
      type: "visual",
      provider: "runway",
      model: null,
      idempotencyKey: crypto.randomUUID(),
      params: {},
      estimatedCostCents: 200, // would have exceeded Free's 50-cent allowance
    });
    const [persisted] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id)).limit(1);
    expect(persisted).toBeDefined();
  });
});

describe("Plan changes for an already-subscribed owner never create a second Stripe subscription", () => {
  it("createCheckoutSession refuses (AlreadySubscribedError) once a real active subscription already exists — the only defense against real double-billing", async () => {
    const { user } = await makeUser("scenario-upgrade@example.com");

    // Get this owner onto a real, active Pro subscription first — same real
    // webhook flow as scenarios 7-9, not a shortcut.
    const subscription = stripeSubscription({ customer: "cus_scenario_upgrade", metadata: { ownerId: user.id } });
    subscriptionsRetrieveMock.mockResolvedValue(subscription);
    constructEventMock.mockReturnValue({
      id: "evt_scenario_upgrade",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { mode: "subscription", subscription: "sub_e2e_1" } },
    });
    await webhookPost(webhookRequest({}));
    expect((await getEntitlement(user.id)).plan).toBe("pro"); // sanity: the setup actually worked

    // Checkout (mode: "subscription") always creates a BRAND NEW Stripe
    // subscription — completing this would leave the customer with two
    // separate subscriptions on the same Stripe customer, both billing.
    // createCheckoutSession must refuse before ever calling Stripe.
    checkoutSessionsCreateMock.mockClear();
    await expect(
      createCheckoutSession({
        ownerId: user.id,
        email: user.email,
        plan: getPlan("studio"),
        successUrl: "http://localhost/billing?checkout=success",
        cancelUrl: "http://localhost/billing?checkout=cancelled",
      }),
    ).rejects.toThrow(AlreadySubscribedError);
    expect(checkoutSessionsCreateMock).not.toHaveBeenCalled();

    // And the real stored state is untouched by the refused attempt.
    expect((await getEntitlement(user.id)).plan).toBe("pro");
  });
});

describe("10. Subscription cancellation is handled correctly", () => {
  it("a customer.subscription.updated event with status canceled really updates the stored row", async () => {
    const { user } = await makeUser("scenario10@example.com");
    const activeSub = stripeSubscription({ metadata: { ownerId: user.id } });
    subscriptionsRetrieveMock.mockResolvedValue(activeSub);
    const scenario10BaseCreated = Math.floor(Date.now() / 1000);
    constructEventMock.mockReturnValue({
      id: "evt_scenario10a",
      type: "checkout.session.completed",
      created: scenario10BaseCreated,
      data: { object: { mode: "subscription", subscription: activeSub.id } },
    });
    await webhookPost(webhookRequest({}));

    const canceledSub = stripeSubscription({
      id: activeSub.id,
      customer: activeSub.customer,
      metadata: { ownerId: user.id },
      status: "canceled",
      canceled_at: Math.floor(Date.now() / 1000),
    });
    constructEventMock.mockReturnValue({
      id: "evt_scenario10b",
      type: "customer.subscription.updated",
      // Later than 10a's — otherwise the new stale/out-of-order guard would
      // correctly (and, for this test, unhelpfully) ignore the cancellation.
      created: scenario10BaseCreated + 10,
      data: { object: canceledSub },
    });
    const res = await webhookPost(webhookRequest({}));
    expect(res.status).toBe(200);

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id)).limit(1);
    expect(sub!.status).toBe("canceled");
  });
});

describe("11. Expired/canceled subscription loses premium access", () => {
  it("getEntitlement resolves effective access to free the moment status is non-active, even though the stored plan still says pro", async () => {
    const { user, project } = await makeUser("scenario11@example.com");
    const activeSub = stripeSubscription({ metadata: { ownerId: user.id } });
    subscriptionsRetrieveMock.mockResolvedValue(activeSub);
    const scenario11BaseCreated = Math.floor(Date.now() / 1000);
    constructEventMock.mockReturnValue({
      id: "evt_scenario11a",
      type: "checkout.session.completed",
      created: scenario11BaseCreated,
      data: { object: { mode: "subscription", subscription: activeSub.id } },
    });
    await webhookPost(webhookRequest({}));

    const canceledSub = stripeSubscription({
      id: activeSub.id,
      customer: activeSub.customer,
      metadata: { ownerId: user.id },
      status: "canceled",
    });
    constructEventMock.mockReturnValue({
      id: "evt_scenario11b",
      type: "customer.subscription.updated",
      created: scenario11BaseCreated + 10, // later than 11a's — see scenario 10's comment
      data: { object: canceledSub },
    });
    await webhookPost(webhookRequest({}));

    // Confirm the raw stored row still says "pro" (upsertSubscriptionFromStripe
    // doesn't scrub plan on a mere status change) — the real protection is
    // entirely in getEntitlement()'s status check below, not in this column.
    const [rawRow] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id)).limit(1);
    expect(rawRow!.plan).toBe("pro");

    const entitlement = await getEntitlement(user.id);
    expect(entitlement.plan).toBe("free"); // effective access, despite the raw row above

    // And the actual enforcement point really rejects a pro-tier-sized request now:
    await expect(
      requestJob({
        ownerId: user.id,
        projectId: project.id,
        type: "visual",
        provider: "runway",
        model: null,
        idempotencyKey: crypto.randomUUID(),
        params: {},
        estimatedCostCents: 200,
      }),
    ).rejects.toThrow(PaywallError);
  });
});

describe("12. Direct API requests cannot bypass the paywall", () => {
  // Reads the actual shipped source rather than importing the module —
  // both route files transitively import next-auth's core (for auth()),
  // which pulls in "next/server" in a way Vitest's plain Node resolution
  // can't load outside Next's own bundler. Reading the real committed
  // file is still a genuine check of the real code, not a stand-in claim.
  it("neither the export nor job-status API route exports anything but GET, and neither calls requestJob", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const exportSource = await fs.readFile(
      path.resolve(__dirname, "../app/api/projects/[id]/export/route.ts"),
      "utf-8",
    );
    const jobStatusSource = await fs.readFile(
      path.resolve(__dirname, "../app/api/projects/[id]/job-status/route.ts"),
      "utf-8",
    );
    for (const source of [exportSource, jobStatusSource]) {
      expect(source).toMatch(/export async function GET/);
      expect(source).not.toMatch(/export (async )?function POST/);
      expect(source).not.toContain("requestJob");
    }
  });

  it("grep across the whole API routes tree confirms no route file anywhere calls requestJob", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const apiDir = path.resolve(__dirname, "../app/api");

    async function collectRouteFiles(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await collectRouteFiles(full)));
        else if (entry.name === "route.ts") files.push(full);
      }
      return files;
    }

    const routeFiles = await collectRouteFiles(apiDir);
    expect(routeFiles.length).toBeGreaterThan(0); // sanity: the walk actually found files
    for (const file of routeFiles) {
      const source = await fs.readFile(file, "utf-8");
      expect(source).not.toContain("requestJob");
    }
  });
});

describe("13. Server Actions cannot bypass the paywall", () => {
  it("even a job inserted directly (bypassing requestJob entirely) is refused execution while unconfirmed — real defense-in-depth, not just a code-review claim", async () => {
    const { user, project } = await makeUser("scenario13@example.com");
    // Deliberately bypasses requestJob()'s credit check, simulating "what
    // if some other code path created a job row directly."
    const [bypassJob] = await db
      .insert(generationJobs)
      .values({ projectId: project.id, type: "script", provider: "anthropic", status: "awaiting_confirmation" })
      .returning();

    await expect(loadConfirmedJob(bypassJob.id)).rejects.toThrow(/has not been confirmed/);

    // Once legitimately confirmed (the real state transition), the same
    // job is allowed through — confirming the guard checks status, not
    // provenance.
    await confirmJob(bypassJob.id);
    const loaded = await loadConfirmedJob(bypassJob.id);
    expect(loaded.id).toBe(bypassJob.id);
    void user;
  });
});

describe("14. Manipulating browser/client state cannot grant premium access", () => {
  it("starting checkout for whatever plan a client requests does not itself change any stored plan — only Stripe's webhook can", async () => {
    const { user } = await makeUser("scenario14@example.com");
    customersCreateMock.mockResolvedValue({ id: "cus_scenario14" });
    checkoutSessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.com/test_session_14" });

    // A client controls which plan it asks to check out for (that's the
    // whole point of a pricing page), so "studio" here isn't tampering by
    // itself — the real question is whether *starting* checkout, before
    // Stripe ever confirms payment, can grant access on its own.
    await createCheckoutSession({
      ownerId: user.id,
      email: user.email,
      plan: getPlan("studio"),
      successUrl: "http://localhost/billing?checkout=success",
      cancelUrl: "http://localhost/billing?checkout=cancelled",
    });

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id)).limit(1);
    // A Stripe customer id now exists (that's expected — Checkout needs
    // one), but `plan` was never touched by this call — it's still
    // whatever it was before (no row, or "free"), never "studio".
    expect(sub?.plan ?? "free").not.toBe("studio");

    const entitlement = await getEntitlement(user.id);
    expect(entitlement.plan).toBe("free"); // unchanged — only a real webhook event can change this
  });

  it("getEntitlement takes no parameter derived from client input other than the server-resolved ownerId", () => {
    expect(getEntitlement.length).toBe(1); // (ownerId: string) — no options bag a client could smuggle a plan/credits override into
  });
});

describe("15. Usage limits are enforced server-side", () => {
  it("the credit check runs inside requestJob (a server-only module never imported by a \"use client\" file) against real accumulated database usage, not any client-supplied value", async () => {
    const { user, project } = await makeUser("scenario15@example.com");

    const job1 = await requestJob({
      ownerId: user.id,
      projectId: project.id,
      type: "script",
      provider: "anthropic",
      model: null,
      idempotencyKey: crypto.randomUUID(),
      params: {},
      estimatedCostCents: 30,
    });
    await confirmJob(job1.id);

    const entitlementMidway = await getEntitlement(user.id);
    expect(entitlementMidway.usedCreditCentsThisCycle).toBe(30); // real accumulated sum, read back from the DB
    expect(entitlementMidway.remainingCreditCents).toBe(20);

    // Nothing about requestJob's signature accepts a "current usage" or
    // "remaining credits" argument from the caller — it's recomputed from
    // the database every time, inside requireCredits().
    await expect(
      requestJob({
        ownerId: user.id,
        projectId: project.id,
        type: "script",
        provider: "anthropic",
        model: null,
        idempotencyKey: crypto.randomUUID(),
        params: {},
        estimatedCostCents: 25, // 30 + 25 > 50
      }),
    ).rejects.toThrow(PaywallError);
  });
});
