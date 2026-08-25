import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { characterReferences, generationJobs, usageCosts } from "@/db/schema";
import { loadOwnedCharacter } from "@/lib/authz";
import { isStalled } from "@/lib/jobs";
import { imageProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { JobConfirmCard, StalledJobCard } from "@/components/job-cards";
import {
  cancelCharacterImages,
  confirmCharacterImages,
  deleteCharacter,
  getCharacterImageUrl,
  retryCharacterImages,
  updateCharacter,
} from "../actions";
import { CharacterForm } from "../character-form";
import { GenerateCharacterSheetForm, RunConsistencyTestForm } from "../character-generation";
import { ReferenceCard, UploadReferenceForm } from "../character-references";

export const dynamic = "force-dynamic";

export default async function CharacterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    notFound();
  }

  let character;
  try {
    character = await loadOwnedCharacter(id, session.user.id);
  } catch {
    notFound();
  }

  const refs = await db
    .select()
    .from(characterReferences)
    .where(eq(characterReferences.characterId, character.id))
    .orderBy(desc(characterReferences.createdAt));
  const refCards = await Promise.all(
    refs.map(async (ref) => ({ ref, url: await getCharacterImageUrl(ref.mediaAssetId) })),
  );

  const hasApprovedReference = refs.some((r) => r.approved);

  const jobs = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.characterId, character.id))
    .orderBy(desc(generationJobs.createdAt));
  const imagesJob = jobs.find((j) => j.type === "character_images");

  const [imagesCost] = imagesJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, imagesJob.id)).limit(1)
    : [];

  const disabledReason = !imageProvider.isConfigured()
    ? "Character image generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app."
    : !storageProvider.isConfigured()
      ? "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app."
      : null;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{character.name}</h1>
        {character.isRealPerson && (
          <p className="mt-1 text-xs text-muted">
            Real person — permission notes: {character.permissionNotes}
          </p>
        )}
      </div>

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">Edit character</summary>
        <div className="mt-4">
          <CharacterForm
            action={updateCharacter}
            characterId={character.id}
            submitLabel="Save changes"
            defaults={{
              name: character.name,
              description: character.description,
              face: character.face ?? undefined,
              skinTone: character.skinTone ?? undefined,
              hair: character.hair ?? undefined,
              bodyType: character.bodyType ?? undefined,
              apparentAge: character.apparentAge ?? undefined,
              distinguishingDetails: character.distinguishingDetails ?? undefined,
              defaultClothing: character.defaultClothing ?? undefined,
              accessories: character.accessories ?? undefined,
              palette: character.palette ?? undefined,
              negativePrompt: character.negativePrompt ?? undefined,
              assignedVoiceId: character.assignedVoiceId ?? undefined,
              isRealPerson: character.isRealPerson,
              permissionNotes: character.permissionNotes ?? undefined,
            }}
          />
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Reference images</h2>
        <UploadReferenceForm characterId={character.id} />

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
            ? "At least one approved reference — generated images will try to match its identity."
            : "No approved reference yet — generated images will be based on the description/appearance fields only, with weaker identity consistency."}
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
            label="character image generation"
            confirmAction={confirmCharacterImages}
            cancelAction={cancelCharacterImages}
          />
        )}
        {imagesJob?.status === "running" && isStalled(imagesJob) && (
          <StalledJobCard jobId={imagesJob.id} label="Character image generation" retryAction={retryCharacterImages} />
        )}
        {imagesJob?.status === "failed" && (
          <p className="rounded-lg border border-dashed border-red-400/40 p-4 text-sm text-red-400">
            Generation failed: {imagesJob.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <RunConsistencyTestForm characterId={character.id} disabledReason={disabledReason} />
          <GenerateCharacterSheetForm characterId={character.id} disabledReason={disabledReason} />
        </div>
      </section>

      <form action={deleteCharacter}>
        <input type="hidden" name="characterId" value={character.id} />
        <button
          type="submit"
          className="h-11 w-fit rounded-lg border border-red-400/40 px-4 text-sm text-red-400 hover:bg-red-400/10"
        >
          Delete character (permanent — removes all reference images from storage too)
        </button>
      </form>
    </div>
  );
}
