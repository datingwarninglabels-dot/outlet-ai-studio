import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LandingPage } from "./landing-page";

export const dynamic = "force-dynamic";

const TITLE = "Outlet AI Studio — Your idea. Your voice. Your outlet.";
const DESCRIPTION =
  "Write the script, build consistent characters, create cinematic scenes, add natural voices, and export platform-ready videos and thumbnails — all in one creative workspace.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Outlet AI Studio",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Outlet AI Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default async function RootPage() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length === 0) {
    redirect("/setup");
  }

  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  // Owner exists, no session: this is a logged-out visitor — render the
  // public marketing page instead of bouncing to /login. Login stays a
  // separate, explicit destination (header "Log in" link, or wherever an
  // auth-gated route's own redirect sends someone — see auth.config.ts).
  return <LandingPage />;
}
