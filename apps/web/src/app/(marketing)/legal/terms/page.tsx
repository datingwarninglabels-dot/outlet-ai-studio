import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Terms of Service — Outlet AI Studio", robots: { index: false } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        A complete Terms of Service will be published before public launch. In the meantime, using
        Outlet AI Studio&apos;s early-access features means agreeing to use them responsibly and in
        line with the Acceptable Use policy.
      </p>
      <h2>Ownership</h2>
      <p>
        You own the content you create, subject to these terms and to the usage terms of the AI
        providers used to generate it.
      </p>
      <h2>No guarantees</h2>
      <p>
        Outlet AI Studio doesn&apos;t guarantee any particular result, view count, or outcome from
        content you create — generation quality depends on the underlying AI providers, which can
        change.
      </p>
    </LegalPage>
  );
}
