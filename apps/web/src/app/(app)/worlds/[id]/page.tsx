import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, usageCosts, worldReferences } from "@/db/schema";
import { loadOwnedWorld } from "@/lib/authz";
import { isStalled } from "@/lib/jobs";
import { imageProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { JobConfirmCard, StalledJobCard } from "@/components/job-cards";
import { listOwnedCharacters } from "../../characters/actions";
import {
  cancelWorldImages,
  confirmWorldImages,
  deleteWorld,
  getWorldImageUrl,
  listAssignedCharacterIds,
  retryWorldImages,
  updateWorld,
} from "../actions";
import { WorldForm } from "../world-form";
import { GenerateWorldReferenceSetForm, RunWorldConsistencyTestForm } from "../world-generation";
import { ReferenceCard, UploadReferenceForm } from "../world-references";

export const dynamic = "force-dynamic";

export default async function WorldDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    notFound();
  }

  let world;
  try {
    world = await loadOwnedWorld(id, session.user.id);
  } catch {
    notFound();
  }

  const [refs, ownedCharacters, assignedCharacterIds] = await Promise.all([
    db.select().from(worldReferences).where(eq(worldReferences.worldId, world.id)).orderBy(desc(worldReferences.createdAt)),
    listOwnedCharacters(session.user.id),
    listAssignedCharacterIds(world.id),
  ]);
  const refCards = await Promise.all(
    refs.map(async (ref) => ({ ref, url: await getWorldImageUrl(ref.mediaAssetId) })),
  );

  const hasApprovedReference = refs.some((r) => r.approved);

  const jobs = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.worldId, world.id))
    .orderBy(desc(generationJobs.createdAt));
  const imagesJob = jobs.find((j) => j.type === "world_images");

  const [imagesCost] = imagesJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, imagesJob.id)).limit(1)
    : [];

  const disabledReason = !imageProvider.isConfigured()
    ? "World image generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app."
    : !storageProvider.isConfigured()
      ? "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app."
      : null;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{world.name}</h1>
      </div>

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">Edit world</summary>
        <div className="mt-4">
          <WorldForm
            action={updateWorld}
            worldId={world.id}
            submitLabel="Save changes"
            ownedCharacters={ownedCharacters.map((c) => ({ id: c.id, name: c.name }))}
            assignedCharacterIds={assignedCharacterIds}
            defaults={{
              name: world.name,
              description: world.description,
              locationDescription: world.locationDescription ?? undefined,
              propsVehicles: world.propsVehicles ?? undefined,
              outfitsAccessories: world.outfitsAccessories ?? undefined,
              lightingPalette: world.lightingPalette ?? undefined,
              cameraStyle: world.cameraStyle ?? undefined,
              animationStyle: world.animationStyle ?? undefined,
              timeOfDay: world.timeOfDay ?? undefined,
              weather: world.weather ?? undefined,
              negativePrompt: world.negativePrompt ?? undefined,
            }}
          />
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Reference images</h2>
        <UploadReferenceForm worldId={world.id} />

        {refCards.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {refCards.map(({ ref, url }) => (
              <ReferenceCard
                key={ref.id}
                referenceId={ref.id}
                imageUrl={url}
                viewType={ref.viewType}
                source={ref.source}
                approved={ref.approved}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted">
          {hasApprovedReference
            ? "At least one approved reference — generated images will try to match its setting/style."
            : "No approved reference yet — generated images will be based on the description/detail fields only, with weaker consistency."}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Generate images</h2>

        {imagesJob?.status === "awaiting_confirmation" && imagesCost && (
          <JobConfirmCard
            jobId={imagesJob.id}
            estimatedCostCents={imagesCost.estimatedCostCents}
            provider={imagesJob.provider}
            model={imagesJob.model}
            label="world image generation"
            confirmAction={confirmWorldImages}
            cancelAction={cancelWorldImages}
          />
        )}
        {imagesJob?.status === "running" && isStalled(imagesJob) && (
          <StalledJobCard jobId={imagesJob.id} label="World image generation" retryAction={retryWorldImages} />
        )}
        {imagesJob?.status === "failed" && (
          <p className="rounded-lg border border-dashed border-red-400/40 p-4 text-sm text-red-400">
            Generation failed: {imagesJob.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <RunWorldConsistencyTestForm worldId={world.id} disabledReason={disabledReason} />
          <GenerateWorldReferenceSetForm worldId={world.id} disabledReason={disabledReason} />
        </div>
      </section>

      <form action={deleteWorld}>
        <input type="hidden" name="worldId" value={world.id} />
        <button
          type="submit"
          className="h-10 w-fit rounded-lg border border-red-400/40 px-4 text-sm text-red-400 hover:bg-red-400/10"
        >
          Delete world (permanent — removes all reference images from storage too)
        </button>
      </form>
    </div>
  );
}
