// Split out from lib/entitlements.ts deliberately — that module imports
// @/db (server-only: a live Postgres connection at module load). Client
// components need this exact string (to detect a paywall error and render
// <Paywall /> instead of a plain error message) without pulling the whole
// DB-touching entitlement module into the browser bundle.
export const PAYWALL_MESSAGE =
  "You've used all your credits for this billing cycle. Upgrade your plan to keep generating.";
