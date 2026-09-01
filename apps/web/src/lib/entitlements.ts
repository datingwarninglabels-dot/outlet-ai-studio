import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, type DbClient } from "@/db";
import { subscriptions, usageCosts } from "@/db/schema";
import { PAYWALL_MESSAGE } from "@/lib/paywall-message";

export type PlanId = "free" | "pro" | "studio";

export const PLAN_IDS: PlanId[] = ["free", "pro", "studio"];

// Stripe subscription statuses that mean "the customer currently has paid
// access" — everything else (canceled, unpaid, past_due, incomplete,
// incomplete_expired) means access has lapsed, even if the `plan` column
// still says "pro"/"studio" (a webhook race, or a subscription that ended
// but hasn't been downgraded yet). Server-side authorization always checks
// status, never `plan` alone — see getEntitlement().
const ACTIVE_STRIPE_STATUSES = new Set(["active", "trialing"]);

/**
 * Monthly credit allowance per plan, expressed directly in cost-cents —
 * the same unit lib/cost-estimate.ts already computes real provider cost
 * in. This is a deliberate design choice: a credit IS a cent of real
 * provider spend, not an independently-invented conversion rate, so there
 * is no "how many credits does an image cost" number to make up — it's
 * just estimateImageCostCents() etc., already implemented and tested.
 *
 * The actual allowance per plan is a real business decision nobody has
 * approved yet — same "never invent a number" rule this codebase has
 * applied everywhere else (lib/plans.ts's priceLabel, the marketing
 * brief). Configured via environment variables with conservative
 * development-only fallbacks; production must set real values before
 * relying on these limits meaning anything.
 */
function creditAllowanceCentsFromEnv(envVar: string, devFallbackCents: number): number {
  const raw = process.env[envVar];
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      `[entitlements] ${envVar} is not set in production — falling back to a development-only placeholder value (${devFallbackCents} cents/month). Set ${envVar} to your real chosen allowance.`,
    );
  }
  return devFallbackCents;
}

export function getPlanLimits(): Record<PlanId, { monthlyCreditCents: number }> {
  return {
    free: { monthlyCreditCents: creditAllowanceCentsFromEnv("FREE_PLAN_MONTHLY_CREDIT_CENTS", 100) },
    pro: { monthlyCreditCents: creditAllowanceCentsFromEnv("PRO_PLAN_MONTHLY_CREDIT_CENTS", 2000) },
    studio: { monthlyCreditCents: creditAllowanceCentsFromEnv("STUDIO_PLAN_MONTHLY_CREDIT_CENTS", 6000) },
  };
}

export type Entitlement = {
  plan: PlanId;
  /** Stripe's subscription status verbatim, or null for a free/no-subscription account. */
  status: string | null;
  monthlyCreditCents: number;
  usedCreditCentsThisCycle: number;
  remainingCreditCents: number;
  periodStart: Date;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

function startOfCurrentCalendarMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Sums what this owner has actually committed to spend since `since` —
 * only jobs that were confirmed (the Owner/customer agreed to the
 * estimate) count, so a cancelled/never-confirmed job never counts against
 * credits. Uses the real actual cost once known, falling back to the
 * estimate for a job that's still running or that failed before actual
 * cost was recorded (a simplification: this app doesn't track exact
 * partial-failure spend, so a confirmed-then-failed job is still charged
 * its estimate rather than $0 — worth revisiting if partial-failure
 * refunds ever matter).
 */
async function sumCommittedCostCentsSince(ownerId: string, since: Date, dbClient: DbClient = db): Promise<number> {
  const [row] = await dbClient
    .select({
      total: sql<string>`coalesce(sum(coalesce(${usageCosts.actualCostCents}, ${usageCosts.estimatedCostCents})), 0)`,
    })
    .from(usageCosts)
    .where(and(eq(usageCosts.ownerId, ownerId), isNotNull(usageCosts.confirmedAt), gte(usageCosts.createdAt, since)));
  return Number(row?.total ?? 0);
}

/**
 * The single source of truth for "what can this account currently do" —
 * every premium check in the app (requestJob's credit gate, the billing
 * page, the paywall component) goes through this rather than reading
 * `subscriptions.plan` directly, so the active-status check can never be
 * accidentally skipped somewhere.
 *
 * Optional `dbClient` lets a caller run this inside its OWN transaction
 * (see requireCredits below) instead of always querying through the
 * module-level pooled `db` — needed so a credit check and the job/usage
 * row it gates can be made atomic under one advisory lock, rather than two
 * independent round trips a concurrent request could race between.
 */
export async function getEntitlement(ownerId: string, dbClient: DbClient = db): Promise<Entitlement> {
  const [sub] = await dbClient.select().from(subscriptions).where(eq(subscriptions.ownerId, ownerId)).limit(1);

  const rawPlan = (sub?.plan as PlanId | undefined) ?? "free";
  const hasActivePaidStatus = sub?.status ? ACTIVE_STRIPE_STATUSES.has(sub.status) : false;
  // A lapsed/cancelled/past_due paid subscription never keeps paid access,
  // regardless of what the `plan` column still says — see the
  // ACTIVE_STRIPE_STATUSES comment above.
  const plan: PlanId = rawPlan === "free" || hasActivePaidStatus ? rawPlan : "free";

  const periodStart = sub?.currentPeriodStart ?? startOfCurrentCalendarMonth();
  const periodEnd = sub?.currentPeriodEnd ?? null;

  const usedCreditCentsThisCycle = await sumCommittedCostCentsSince(ownerId, periodStart, dbClient);
  const monthlyCreditCents = getPlanLimits()[plan].monthlyCreditCents;

  return {
    plan,
    status: sub?.status ?? null,
    monthlyCreditCents,
    usedCreditCentsThisCycle,
    remainingCreditCents: Math.max(0, monthlyCreditCents - usedCreditCentsThisCycle),
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
}

// Re-exported for convenience so server-side call sites can import it
// alongside PaywallError/requireCredits from this one module — the actual
// definition lives in lib/paywall-message.ts (a client-safe module with no
// @/db import), which is what client components should import from
// instead of this file.
export { PAYWALL_MESSAGE };

export class PaywallError extends Error {
  entitlement: Entitlement;
  constructor(entitlement: Entitlement) {
    super(PAYWALL_MESSAGE);
    this.name = "PaywallError";
    this.entitlement = entitlement;
  }
}

/**
 * Throws PaywallError if this generation would exceed the owner's
 * remaining credits this cycle. Called from requestJob() — the single
 * choke point every generation type already funnels through (see
 * lib/jobs.ts) — so this is enforced consistently everywhere, not
 * per-feature. Server-side only: the client never decides this.
 *
 * Accepts an optional `dbClient` so requestJob can pass its own
 * transaction — see requestJob's comment for why this check being a bare,
 * separate round trip from the job/usage-row insert would let two
 * concurrent requests both pass it before either commits.
 */
export async function requireCredits(ownerId: string, costCents: number, dbClient: DbClient = db): Promise<void> {
  const entitlement = await getEntitlement(ownerId, dbClient);
  if (entitlement.remainingCreditCents < costCents) {
    throw new PaywallError(entitlement);
  }
}
