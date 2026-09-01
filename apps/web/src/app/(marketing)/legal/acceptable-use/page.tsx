import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Acceptable Use Policy — Outlet AI Studio", robots: { index: false } };

export default function AcceptableUsePage() {
  return (
    <LegalPage title="Acceptable Use">
      <p>
        Outlet AI Studio is for creating original content responsibly. A complete policy is coming;
        in the meantime, the following apply:
      </p>
      <h2>Real people</h2>
      <p>
        A character based on a real person requires documented permission before it can be saved.
        Deceptive impersonation of real, identifiable people is not allowed.
      </p>
      <h2>Prohibited content</h2>
      <p>
        No content that is illegal, harassing, or intended to deceive or defraud. No attempts to use
        the platform to generate content that violates a connected AI provider&apos;s own usage
        policies.
      </p>
    </LegalPage>
  );
}
