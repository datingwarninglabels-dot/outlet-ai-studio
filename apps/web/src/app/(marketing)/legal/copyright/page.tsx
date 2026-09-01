import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Copyright & Takedown — Outlet AI Studio", robots: { index: false } };

export default function CopyrightPage() {
  return (
    <LegalPage title="Copyright & Takedown">
      <p>
        If you believe content generated or hosted through Outlet AI Studio infringes your copyright,
        a formal takedown process — including a designated contact — will be published here before
        public launch.
      </p>
      <p>
        In the meantime, do not upload or attempt to generate content using material you don&apos;t
        have the rights to use.
      </p>
    </LegalPage>
  );
}
