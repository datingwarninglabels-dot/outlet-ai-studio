import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacy Policy — Outlet AI Studio", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This draft describes, in plain terms, what Outlet AI Studio currently collects. A complete,
        legally-reviewed Privacy Policy will replace this page before public launch.
      </p>
      <h2>What we collect today</h2>
      <p>
        If you join the waitlist: the email address and optional creator-type you submit. If you have
        an account: your email, name, and authentication details. Generated projects and media are
        stored privately and are not shared with other users.
      </p>
      <h2>What we don&apos;t do</h2>
      <p>
        We don&apos;t sell your data. We don&apos;t use your private prompts, scripts, or generated
        media to train third-party models beyond what a connected AI provider&apos;s own terms
        require for processing your request.
      </p>
      <h2>Your choices</h2>
      <p>
        You can ask to have your waitlist entry or account data removed at any time — see the Support
        contact in the footer once one is published.
      </p>
    </LegalPage>
  );
}
