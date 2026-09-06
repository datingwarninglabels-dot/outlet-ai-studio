import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked for the same reason every other DB-touching test in this project
// mocks @/db — no live database in this environment. Two distinct select
// chains are mocked in call order: (1) the subscription row lookup, (2)
// the usage-sum aggregate inside sumCommittedCostCentsSince.
const selectMock = vi.fn();

vi.mock("@/db", () => ({
  db: { select: selectMock },
}));

function subscriptionSelectResult(row: Record<string, unknown> | undefined) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }) };
}

function usageSumSelectResult(totalCents: number) {
  return { from: () => ({ where: () => Promise.resolve([{ total: String(totalCents) }]) }) };
}

const { getEntitlement, requireCredits, PaywallError, PAYWALL_MESSAGE } = await import("./entitlements");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FREE_PLAN_MONTHLY_CREDIT_CENTS;
  delete process.env.PRO_PLAN_MONTHLY_CREDIT_CENTS;
  delete process.env.STUDIO_PLAN_MONTHLY_CREDIT_CENTS;
});

describe("getEntitlement — plan resolution", () => {
  it("treats no subscription row as the free plan", async () => {
    selectMock.mockReturnValueOnce(subscriptionSelectResult(undefined));
    selectMock.mockReturnValueOnce(usageSumSelectResult(0));

    const entitlement = await getEntitlement("owner-1");
    expect(entitlement.plan).toBe("free");
    expect(entitlement.status).toBeNull();
  });

  it("grants paid access when status is active", async () => {
    selectMock.mockReturnValueOnce(
      subscriptionSelectResult({ plan: "pro", status: "active", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }),
    );
    selectMock.mockReturnValueOnce(usageSumSelectResult(0));

    const entitlement = await getEntitlement("owner-1");
    expect(entitlement.plan).toBe("pro");
  });

  it("grants paid access when status is trialing", async () => {
    selectMock.mockReturnValueOnce(
      subscriptionSelectResult({ plan: "studio", status: "trialing", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }),
    );
    selectMock.mockReturnValueOnce(usageSumSelectResult(0));

    const entitlement = await getEntitlement("owner-1");
    expect(entitlement.plan).toBe("studio");
  });

  it("downgrades to free the moment status is canceled, even though `plan` still says pro — this is the actual immediate-downgrade enforcement", async () => {
    selectMock.mockReturnValueOnce(
      subscriptionSelectResult({ plan: "pro", status: "canceled", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }),
    );
    selectMock.mockReturnValueOnce(usageSumSelectResult(0));

    const entitlement = await getEntitlement("owner-1");
    expect(entitlement.plan).toBe("free");
    expect(entitlement.status).toBe("canceled");
  });

  it("downgrades to free on past_due (a failed payment) just as immediately as on cancellation", async () => {
    selectMock.mockReturnValueOnce(
      subscriptionSelectResult({ plan: "studio", status: "past_due", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }),
    );
    selectMock.mockReturnValueOnce(usageSumSelectResult(0));

    const entitlement = await getEntitlement("owner-1");
    expect(entitlement.plan).toBe("free");
  });
});

describe("getEntitlement — credit accounting", () => {
  it("computes remaining credits as allowance minus used, never below zero", async () => {
    process.env.FREE_PLAN_MONTHLY_CREDIT_CENTS = "100";
    selectMock.mockReturnValueOnce(subscriptionSelectResult(undefined));
    selectMock.mockReturnValueOnce(usageSumSelectResult(40));

    const entitlement = await getEntitlement("owner-1");
    expect(entitlement.monthlyCreditCents).toBe(100);
    expect(entitlement.usedCreditCentsThisCycle).toBe(40);
    expect(entitlement.remainingCreditCents).toBe(60);
  });

  it("clamps remainingCreditCents to 0 rather than going negative when usage exceeds the allowance", async () => {
    process.env.FREE_PLAN_MONTHLY_CREDIT_CENTS = "100";
    selectMock.mockReturnValueOnce(subscriptionSelectResult(undefined));
    selectMock.mockReturnValueOnce(usageSumSelectResult(150));

    const entitlement = await getEntitlement("owner-1");
    expect(entitlement.remainingCreditCents).toBe(0);
  });
});

describe("requireCredits — the actual paywall gate", () => {
  it("throws PaywallError with the shared PAYWALL_MESSAGE when the request would exceed remaining credits", async () => {
    process.env.FREE_PLAN_MONTHLY_CREDIT_CENTS = "100";
    selectMock.mockReturnValueOnce(subscriptionSelectResult(undefined));
    selectMock.mockReturnValueOnce(usageSumSelectResult(90));

    const err = await requireCredits("owner-1", 20).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaywallError);
    expect((err as Error).message).toBe(PAYWALL_MESSAGE);
  });

  it("does not throw when there's enough remaining credit", async () => {
    process.env.FREE_PLAN_MONTHLY_CREDIT_CENTS = "100";
    selectMock.mockReturnValueOnce(subscriptionSelectResult(undefined));
    selectMock.mockReturnValueOnce(usageSumSelectResult(10));

    await expect(requireCredits("owner-1", 20)).resolves.toBeUndefined();
  });

  it("carries the computed entitlement on the thrown error, for callers that want it", async () => {
    process.env.FREE_PLAN_MONTHLY_CREDIT_CENTS = "100";
    selectMock.mockReturnValueOnce(subscriptionSelectResult(undefined));
    selectMock.mockReturnValueOnce(usageSumSelectResult(100));

    const err = await requireCredits("owner-1", 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaywallError);
    expect((err as InstanceType<typeof PaywallError>).entitlement.remainingCreditCents).toBe(0);
  });
});
