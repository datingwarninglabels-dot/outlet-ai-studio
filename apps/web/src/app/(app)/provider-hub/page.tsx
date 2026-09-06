import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { usageCosts } from "@/db/schema";
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

  // Defense-in-depth alongside the central redirect in auth.config.ts's
  // authorized callback — provider config and platform-wide spend are
  // never customer-facing (confirmed during the marketing landing page's
  // copy audit).
  if (session?.user?.role !== "owner") {
    notFound();
  }

  // Platform-wide spend, not scoped to the viewing Owner's own projects —
  // this page is already role-gated above, so "scoped to the Owner" would
  // now (post-Milestone-2, once customer accounts have their own projects)
  // silently show near-zero numbers instead of real total spend. No join
  // to `projects` either: usage_costs rows for character/world image jobs
  // have a null projectId (see the schema's own "exactly one of
  // projectId/characterId/worldId" comment) — the previous inner join
  // silently excluded those entirely, undercounting real spend even before
  // multi-tenancy existed.
  const spendRows = await db
    .select({
      provider: usageCosts.provider,
      estimatedCents: sql<string>`coalesce(sum(${usageCosts.estimatedCostCents}), 0)`,
      actualCents: sql<string>`coalesce(sum(${usageCosts.actualCostCents}), 0)`,
      confirmedCount: sql<string>`count(${usageCosts.confirmedAt})`,
    })
    .from(usageCosts)
    .groupBy(usageCosts.provider);

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
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Provider Hub"
        description="What each AI provider does, whether it's configured, and what it has cost so far."
      />

      <Alert tone="info">
        Visibility only for now — credentials are set through environment variables (see the root README). Adding,
        testing, and storing your own encrypted keys from this page isn&apos;t built yet.
      </Alert>

      <div className="flex flex-col gap-3">
        {PROVIDER_SLOTS.map((slot) => {
          const spend = spendByProvider.get(slot.key);
          return (
            <Card key={slot.key} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{slot.label}</p>
                <Badge tone={slot.configured ? "success" : "neutral"} dot>
                  {slot.configured ? "Configured" : "Not configured"}
                </Badge>
              </div>
              <ul className="text-xs text-muted">
                {slot.capabilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {!slot.configured && (
                <p className="text-xs text-muted">
                  Set <code className="font-mono">{slot.envVars.join(", ")}</code> and restart the app.
                </p>
              )}
              <p className="text-xs text-muted">
                {spend
                  ? `$${(spend.estimatedCents / 100).toFixed(2)} estimated across ${spend.confirmedCount} confirmed generation${spend.confirmedCount === 1 ? "" : "s"}${
                      spend.actualCents > 0 ? ` · $${(spend.actualCents / 100).toFixed(2)} actual` : ""
                    }`
                  : "No spend yet."}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
