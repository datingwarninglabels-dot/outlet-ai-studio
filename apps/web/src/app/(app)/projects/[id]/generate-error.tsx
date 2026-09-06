"use client";

import { Alert } from "@/components/ui";
import { PAYWALL_MESSAGE } from "@/lib/paywall-message";
import { Paywall } from "../../paywall";

/**
 * Error slot for the project-page generation forms. A hit paywall renders
 * the proper Paywall card (with a link to plans) instead of the raw
 * message as a red alert; every other error is a plain inline alert.
 */
export function GenerateError({ error }: { error: string }) {
  if (!error) return null;
  if (error === PAYWALL_MESSAGE) return <Paywall compact />;
  return <Alert tone="danger">{error}</Alert>;
}
