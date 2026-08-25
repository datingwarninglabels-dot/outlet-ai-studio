"use server";

import crypto from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { waitlistSchema } from "@/lib/validation";

export type WaitlistState = { status: "idle" | "success" | "error"; message: string };

const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_ATTEMPTS = 3;
// Rejects a submission faster than this after the form rendered — a real
// person takes at least a couple seconds to read two fields and a
// checkbox; near-instant submissions are almost always a bot filling the
// form programmatically.
const MIN_SUBMIT_MS = 1500;

async function hashIp(ip: string): Promise<string> {
  // Salted with AUTH_SECRET (already a private, per-deploy secret this app
  // has) so the hash can't be reversed or correlated across deployments —
  // this exists purely to rate-limit, never to identify a visitor.
  const salt = process.env.AUTH_SECRET ?? "outlet-ai-studio-waitlist";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

async function getIpHash(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip");
  if (!ip) {
    return null;
  }
  return hashIp(ip);
}

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const renderedAt = Number(formData.get("renderedAt") ?? 0);
  if (renderedAt && Date.now() - renderedAt < MIN_SUBMIT_MS) {
    // Bot-shaped submission — fail quietly with a generic message rather
    // than reveal the detection method.
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  const parsed = waitlistSchema.safeParse({
    email: formData.get("email"),
    creatorType: formData.get("creatorType") || undefined,
    consent: formData.get("consent") === "on",
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    const message =
      parsed.error.issues.find((i) => i.path[0] === "consent")?.message ??
      "Enter a valid email and agree to the privacy terms to continue.";
    return { status: "error", message };
  }

  if (parsed.data.website) {
    // Honeypot tripped — same generic failure, no hint given to the bot.
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  // Everything past this point touches the database — wrapped so a
  // connection failure or query error becomes the same clear, generic
  // error state as every other failure path, instead of an unhandled
  // exception surfacing a broken page to the visitor.
  try {
    const ipHash = await getIpHash();
    if (ipHash) {
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(waitlistSignups)
        .where(and(eq(waitlistSignups.ipHash, ipHash), gt(waitlistSignups.createdAt, windowStart)));
      if (count >= RATE_LIMIT_MAX_ATTEMPTS) {
        return { status: "error", message: "Too many attempts. Please try again in a few minutes." };
      }
    }

    await db
      .insert(waitlistSignups)
      .values({
        email: parsed.data.email.toLowerCase(),
        creatorType: parsed.data.creatorType ?? null,
        ipHash,
      })
      // A repeat signup is not an error from the visitor's point of view —
      // they're already on the list either way.
      .onConflictDoNothing({ target: waitlistSignups.email });

    return { status: "success", message: "You're on the list — we'll email you when it's your turn." };
  } catch (err) {
    console.error("[waitlist] submission failed", err);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}
