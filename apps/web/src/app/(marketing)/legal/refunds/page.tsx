import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Refund Policy — Outlet AI Studio", robots: { index: false } };

export default function RefundsPage() {
  return (
    <LegalPage title="Refunds & Cancellation">
      <p>
        Billing is not live yet, so there is nothing to refund today. A full refund and cancellation
        policy will be published alongside billing, covering how credits, subscriptions, and
        cancellations are handled.
      </p>
    </LegalPage>
  );
}
