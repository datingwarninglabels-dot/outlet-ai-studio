import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { projects, usageCosts } from "@/db/schema";
import {
  assemblyProvider,
  imageProvider,
  scriptProvider,
  storyboardProvider,
  ttsProvider,
  videoProvider,
} from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";

const PROVIDER_SLOTS = [
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    capabilities: ["Script generation", "Storyboard / scene breakdown"],
    envVars: ["ANTHROPIC_API_KEY"],
    configured: scriptProvider.isConfigured() && storyboardProvider.isConfigured(),
  },
  {
    key: "elevenlabs",
    label: "ElevenLabs",
    capabilities: ["Voice generation (text-to-speech)"],
    envVars: ["ELEVENLABS_API_KEY"],
    configured: ttsProvider.isConfigured(),
  },
  {
    key: "runway",
    label: "Runway",
    capabilities: ["Scene visuals (text-to-image)", "Animation (image-to-video)", "Thumbnail generation"],
    envVars: ["RUNWAYML_API_SECRET"],
    configured: imageProvider.isConfigured() && videoProvider.isConfigured(),
  },
  {
    key: "shotstack",
    label: "Shotstack",
    capabilities: ["Final video assembly"],
    envVars: ["SHOTSTACK_API_KEY"],
    configured: assemblyProvider.isConfigured(),
  },
  {
    key: "storage",
    label: "Object storage (R2 / S3)",
    capabilities: ["Private storage for every generated asset"],
    envVars: ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"],
    configured: storageProvider.isConfigured(),
  },
] as const;

export const dynamic = "force-dynamic";

export default async function ProviderHubPage() {
  const session = await auth();

  const spendRows = session?.user
    ? await db
        .select({
          provider: usageCosts.provider,
          estimatedCents: sql<string>`coalesce(sum(${usageCosts.estimatedCostCents}), 0)`,
          actualCents: sql<string>`coalesce(sum(${usageCosts.actualCostCents}), 0)`,
          confirmedCount: sql<string>`count(${usageCosts.confirmedAt})`,
        })
        .from(usageCosts)
        .innerJoin(projects, eq(usageCosts.projectId, projects.id))
        .where(eq(projects.ownerId, session.user.id))
        .groupBy(usageCosts.provider)
    : [];

  const spendByProvider = new Map(
    spendRows.map((row) => [
      row.provider,
      {
        estimatedCents: Number(row.estimatedCents),
        actualCents: Number(row.actualCents),
        confirmedCount: Number(row.confirmedCount),
      },
    ]),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Provider Hub</h1>
        <p className="mt-1 text-sm text-muted">
          What each provider does, whether it&apos;s configured, and what it&apos;s cost so far.
        </p>
        <p className="mt-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted">
          This is visibility only for now — credentials are still environment-variable-only (see the
          root README). Adding, testing, and storing your own encrypted keys through this page isn&apos;t
          built yet.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {PROVIDER_SLOTS.map((slot) => {
          const spend = spendByProvider.get(slot.key);
          return (
            <div key={slot.key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{slot.label}</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    slot.configured
                      ? "border-accent-teal/40 text-accent-teal"
                      : "border-border text-muted"
                  }`}
                >
                  {slot.configured ? "Configured" : "Not configured"}
                </span>
              </div>
              <ul className="text-xs text-muted">
                {slot.capabilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {!slot.configured && (
                <p className="text-xs text-muted">
                  Set <code>{slot.envVars.join(", ")}</code> and restart the app.
                </p>
              )}
              <p className="text-xs text-muted">
                {spend
                  ? `$${(spend.estimatedCents / 100).toFixed(2)} estimated across ${spend.confirmedCount} confirmed generation${spend.confirmedCount === 1 ? "" : "s"}${
                      spend.actualCents > 0 ? ` · $${(spend.actualCents / 100).toFixed(2)} actual` : ""
                    }`
                  : "No spend yet."}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
