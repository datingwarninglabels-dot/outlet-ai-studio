import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Alert, Badge, Button, PageHeader } from "@/components/ui";
import { db } from "@/db";
import {
  continuityChecks,
  generationJobs,
  jobSteps,
  mediaAssets,
  scenes,
  scripts,
  thumbnails,
  usageCosts,
} from "@/db/schema";
import { isStalled } from "@/lib/jobs";
import { jobStatusLabel, jobStatusTone, jobTypeLabel } from "@/lib/labels";
import { derivePipeline, type PipelineStepState } from "@/lib/pipeline";
import { assemblyProvider, imageProvider, storyboardProvider, ttsProvider, videoProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { loadOwnedProject } from "@/lib/authz";
import { getOrCreateBrandKit } from "../../brand-kit/actions";
import { listOwnedCharacters } from "../../characters/actions";
import { listOwnedWorlds } from "../../worlds/actions";
import {
  cancelAnimation,
  cancelAssembly,
  cancelScript,
  cancelStoryboard,
  cancelVisual,
  cancelVoice,
  confirmAnimation,
  confirmAssembly,
  confirmScript,
  confirmStoryboard,
  confirmVisual,
  confirmVoice,
  getAnimationUrl,
  getFinalVideoUrl,
  getVisualUrl,
  getVoicePlaybackUrl,
  requestStoryboard,
  retryAnimation,
  retryAssembly,
  retryScript,
  retryStoryboard,
  retryVisual,
  retryVoice,
} from "./actions";
import { GenerateAnimationForm } from "./animation-form";
import { GenerateAssemblyForm } from "./assembly-form";
import { JobConfirmCard, StalledJobCard } from "@/components/job-cards";
import { JobNotifications } from "./job-notifications";
import { ProjectPipeline } from "./pipeline";
import { ProjectOverridesForm } from "./project-overrides-form";
import { ContinuityWarningsCard } from "./continuity-warnings";
import { GenerateStoryboardForm } from "./scene-form";
import { SceneList } from "./scene-list";
import { cancelThumbnails, confirmThumbnails, getThumbnailImageUrl, retryThumbnails } from "./thumbnail-actions";
import { GenerateThumbnailsForm, ThumbnailCard } from "./thumbnail-form";
import { GenerateVisualForm } from "./visual-form";
import { GenerateVoiceForm } from "./voice-form";

const SECTION_CLASS = "scroll-mt-28 flex flex-col gap-3 outline-none";

const STATE_TONE: Record<PipelineStepState, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  locked: "neutral",
  ready: "accent",
  awaiting_confirmation: "warning",
  running: "accent",
  failed: "danger",
  done: "success",
};

const STATE_TEXT: Record<PipelineStepState, string> = {
  locked: "Locked",
  ready: "Ready",
  awaiting_confirmation: "Confirm cost",
  running: "Running",
  failed: "Failed",
  done: "Done",
};

/**
 * One pipeline section. A completed step that isn't the one the user is
 * working on renders collapsed (summary + status) so a long project isn't
 * a wall of forms; everything else renders open.
 */
function StepSection({
  id,
  title,
  state,
  children,
}: {
  id: string;
  title: string;
  state: PipelineStepState;
  children: React.ReactNode;
}) {
  const heading = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      <Badge tone={STATE_TONE[state]} dot>
        {STATE_TEXT[state]}
      </Badge>
    </div>
  );

  if (state !== "done") {
    return (
      <section id={`step-${id}`} tabIndex={-1} className={SECTION_CLASS}>
        {heading}
        {children}
      </section>
    );
  }

  return (
    <section id={`step-${id}`} tabIndex={-1} className={SECTION_CLASS}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">
              ›
            </span>
            <h2 className="text-sm font-semibold text-muted">{title}</h2>
          </span>
          <Badge tone="success" dot>
            Done
          </Badge>
        </summary>
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </details>
    </section>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    notFound();
  }

  let project;
  try {
    project = await loadOwnedProject(id, session.user.id);
  } catch {
    notFound();
  }

  // Jobs first — the per-step cost/asset lookups below key off the job ids.
  const jobs = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.projectId, project.id))
    .orderBy(desc(generationJobs.createdAt));

  const scriptJob = jobs.find((job) => job.type === "script");
  const storyboardJob = jobs.find((job) => job.type === "storyboard");
  const voiceJob = jobs.find((job) => job.type === "voice");
  const visualJob = jobs.find((job) => job.type === "visual");
  const animationJob = jobs.find((job) => job.type === "animation");
  const assemblyJob = jobs.find((job) => job.type === "assembly");
  const thumbnailJob = jobs.find((job) => job.type === "thumbnail");
  const jobIds = jobs.map((job) => job.id);

  // One round of independent reads instead of ~20 sequential awaits.
  const [
    scriptRows,
    projectScenes,
    ownedCharacters,
    ownedWorlds,
    brandKit,
    allCosts,
    storyboardStepRows,
    voiceAssetRows,
    visualAssets,
    animationAssets,
    voiceAssetForAssemblyRows,
    finalVideoAssetRows,
    projectThumbnails,
  ] = await Promise.all([
    db.select().from(scripts).where(eq(scripts.projectId, project.id)).orderBy(desc(scripts.createdAt)).limit(1),
    db.select().from(scenes).where(eq(scenes.projectId, project.id)).orderBy(asc(scenes.order)),
    listOwnedCharacters(session.user.id),
    listOwnedWorlds(session.user.id),
    getOrCreateBrandKit(session.user.id),
    jobIds.length > 0
      ? db.select().from(usageCosts).where(inArray(usageCosts.jobId, jobIds))
      : Promise.resolve([] as (typeof usageCosts.$inferSelect)[]),
    storyboardJob
      ? db
          .select()
          .from(jobSteps)
          .where(and(eq(jobSteps.jobId, storyboardJob.id), eq(jobSteps.name, "generate_storyboard")))
          .limit(1)
      : Promise.resolve([] as (typeof jobSteps.$inferSelect)[]),
    voiceJob
      ? db.select().from(mediaAssets).where(eq(mediaAssets.jobId, voiceJob.id)).limit(1)
      : Promise.resolve([] as (typeof mediaAssets.$inferSelect)[]),
    db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "scene_image"))),
    db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "scene_video"))),
    db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "voice_audio")))
      .limit(1),
    db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "final_video")))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(1),
    db.select().from(thumbnails).where(eq(thumbnails.projectId, project.id)).orderBy(desc(thumbnails.createdAt)),
  ]);

  const [script] = scriptRows;
  const [voiceAsset] = voiceAssetRows;
  const [voiceAssetForAssembly] = voiceAssetForAssemblyRows;
  const [finalVideoAsset] = finalVideoAssetRows;
  const [storyboardStep] = storyboardStepRows;
  const storyboardTruncated = Boolean((storyboardStep?.output as { truncated?: boolean } | null)?.truncated);

  const costByJobId = new Map<string, (typeof usageCosts.$inferSelect)>();
  for (const cost of allCosts) {
    if (!costByJobId.has(cost.jobId)) costByJobId.set(cost.jobId, cost);
  }
  const scriptCost = scriptJob ? costByJobId.get(scriptJob.id) : undefined;
  const storyboardCost = storyboardJob ? costByJobId.get(storyboardJob.id) : undefined;
  const voiceCost = voiceJob ? costByJobId.get(voiceJob.id) : undefined;
  const visualCost = visualJob ? costByJobId.get(visualJob.id) : undefined;
  const animationCost = animationJob ? costByJobId.get(animationJob.id) : undefined;
  const assemblyCost = assemblyJob ? costByJobId.get(assemblyJob.id) : undefined;
  const thumbnailCost = thumbnailJob ? costByJobId.get(thumbnailJob.id) : undefined;

  // Second round — these depend on rows from the first.
  const [voicePlaybackUrl, visualUrlEntries, animationUrlEntries, openContinuityChecks, finalVideoUrl, thumbnailCards] =
    await Promise.all([
      voiceAsset ? getVoicePlaybackUrl(voiceAsset.id) : Promise.resolve(null),
      Promise.all(
        visualAssets.map(async (asset) => [asset.sceneId, { asset, url: await getVisualUrl(asset.id) }] as const),
      ),
      Promise.all(
        animationAssets.map(async (asset) => [asset.sceneId, { asset, url: await getAnimationUrl(asset.id) }] as const),
      ),
      projectScenes.length > 0
        ? db
            .select()
            .from(continuityChecks)
            .where(
              and(
                inArray(
                  continuityChecks.sceneId,
                  projectScenes.map((s) => s.id),
                ),
                isNull(continuityChecks.acknowledgedAt),
              ),
            )
            .orderBy(desc(continuityChecks.createdAt))
        : Promise.resolve([] as (typeof continuityChecks.$inferSelect)[]),
      finalVideoAsset ? getFinalVideoUrl(finalVideoAsset.id) : Promise.resolve(null),
      Promise.all(
        projectThumbnails
          .filter((t) => t.compositedAssetId)
          .map(async (t) => ({ thumbnail: t, url: await getThumbnailImageUrl(t.compositedAssetId!) })),
      ),
    ]);

  const visualsBySceneId = new Map(visualUrlEntries);
  const animationsBySceneId = new Map(animationUrlEntries);
  const scenesRemaining = projectScenes.filter((s) => !visualsBySceneId.has(s.id)).length;

  const continuityWarningsBySceneId = new Map<string, { id: string; warnings: { field: string; note: string }[] }>();
  for (const check of openContinuityChecks) {
    const warnings = check.warnings as { field: string; note: string }[];
    if (warnings.length > 0 && !continuityWarningsBySceneId.has(check.sceneId)) {
      continuityWarningsBySceneId.set(check.sceneId, { id: check.id, warnings });
    }
  }

  const scenesAnimatable = projectScenes.filter((s) => visualsBySceneId.has(s.id));
  const scenesRemainingForAnimation = scenesAnimatable.filter((s) => !animationsBySceneId.has(s.id)).length;
  const scenesMissingVisual = projectScenes.filter((s) => !visualsBySceneId.has(s.id)).length;

  const pipeline = derivePipeline({
    hasScript: Boolean(script),
    sceneCount: projectScenes.length,
    hasVoice: Boolean(voiceAsset),
    scenesWithVisual: visualsBySceneId.size,
    scenesWithAnimation: animationsBySceneId.size,
    hasFinalVideo: Boolean(finalVideoAsset),
    thumbnailCount: thumbnailCards.length,
    jobByType: {
      script: scriptJob ? { type: scriptJob.type, status: scriptJob.status } : undefined,
      storyboard: storyboardJob ? { type: storyboardJob.type, status: storyboardJob.status } : undefined,
      voice: voiceJob ? { type: voiceJob.type, status: voiceJob.status } : undefined,
      visual: visualJob ? { type: visualJob.type, status: visualJob.status } : undefined,
      animation: animationJob ? { type: animationJob.type, status: animationJob.status } : undefined,
      assembly: assemblyJob ? { type: assemblyJob.type, status: assemblyJob.status } : undefined,
      thumbnail: thumbnailJob ? { type: thumbnailJob.type, status: thumbnailJob.status } : undefined,
    },
  });
  const stepState = new Map(pipeline.map((s) => [s.id, s.state] as const));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={project.title}
        description={project.platform ?? undefined}
        actions={
          <Button href={`/api/projects/${project.id}/export`} variant="secondary" size="sm">
            Export package
          </Button>
        }
      />

      <ProjectPipeline steps={pipeline} />

      <ProjectOverridesForm
        projectId={project.id}
        visualStyleOverride={project.visualStyleOverride ?? ""}
        voiceIdOverride={project.voiceIdOverride ?? ""}
        brandKitDefaultVisualStyle={brandKit.defaultVisualStyle ?? ""}
        brandKitDefaultVoiceId={brandKit.defaultVoiceId ?? ""}
      />

      <StepSection id="script" title="Script" state={stepState.get("script")!}>
        {scriptJob?.status === "awaiting_confirmation" && scriptCost && (
          <JobConfirmCard
            jobId={scriptJob.id}
            estimatedCostCents={scriptCost.estimatedCostCents}
            provider={scriptJob.provider}
            model={scriptJob.model}
            label="script generation"
            confirmAction={confirmScript}
            cancelAction={cancelScript}
          />
        )}
        {scriptJob?.status === "running" && isStalled(scriptJob) && (
          <StalledJobCard jobId={scriptJob.id} label="Script generation" retryAction={retryScript} />
        )}
        {scriptJob?.status === "failed" && (
          <Alert tone="danger" title="Script generation failed">
            {scriptJob.error}. Start a new project from Create Video to try again.
          </Alert>
        )}
        {scriptJob?.status === "cancelled" && (
          <Alert tone="info">Script generation was cancelled before it started — no cost was incurred.</Alert>
        )}
        {script ? (
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="whitespace-pre-wrap text-sm">{script.content}</p>
            <p className="mt-4 text-xs text-muted">
              {script.provider}/{script.model} · {script.promptTokens ?? "?"} in / {script.completionTokens ?? "?"} out
              tokens
            </p>
          </div>
        ) : (
          !scriptJob && (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
              No script generated yet.
            </p>
          )
        )}
      </StepSection>

      <StepSection id="storyboard" title="Storyboard" state={stepState.get("storyboard")!}>
        {storyboardJob?.status === "awaiting_confirmation" && storyboardCost && (
          <JobConfirmCard
            jobId={storyboardJob.id}
            estimatedCostCents={storyboardCost.estimatedCostCents}
            provider={storyboardJob.provider}
            model={storyboardJob.model}
            label="storyboard generation"
            confirmAction={confirmStoryboard}
            cancelAction={cancelStoryboard}
          />
        )}
        {storyboardJob?.status === "running" && isStalled(storyboardJob) && (
          <StalledJobCard jobId={storyboardJob.id} label="Storyboard generation" retryAction={retryStoryboard} />
        )}
        {storyboardJob?.status === "failed" && (
          <Alert tone="danger" title="Storyboard generation failed">
            {storyboardJob.error}
          </Alert>
        )}
        {storyboardJob?.status === "succeeded" && storyboardTruncated && (
          <Alert tone="warning" title="The model's response was cut off">
            The scene list below may be incomplete. Regenerating replaces it with a fresh attempt (a new request).
            <div className="mt-3">
              <GenerateStoryboardForm
                projectId={project.id}
                disabledReason={
                  !storyboardProvider.isConfigured()
                    ? "Storyboard generation isn't connected yet — add ANTHROPIC_API_KEY to your environment and restart the app."
                    : null
                }
                requestAction={requestStoryboard}
              />
            </div>
          </Alert>
        )}

        {projectScenes.length > 0 ? (
          <div className="flex flex-col gap-3">
            <SceneList
              projectId={project.id}
              scenes={projectScenes.map((scene) => ({
                id: scene.id,
                narration: scene.narration,
                visualDescription: scene.visualDescription,
                audioDirection: scene.audioDirection ?? "",
                durationSeconds: scene.durationSeconds,
                provider: scene.provider,
                model: scene.model,
                version: scene.version,
                characterId: scene.characterId,
                worldId: scene.worldId,
              }))}
              ownedCharacters={ownedCharacters.map((c) => ({ id: c.id, name: c.name }))}
              ownedWorlds={ownedWorlds.map((w) => ({ id: w.id, name: w.name }))}
            />
            <p className="text-xs text-muted">
              Total estimated runtime: {projectScenes.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)}s across{" "}
              {projectScenes.length} scene{projectScenes.length === 1 ? "" : "s"}.
            </p>
          </div>
        ) : (
          (!storyboardJob || storyboardJob.status === "failed" || storyboardJob.status === "cancelled") && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
              <p className="text-sm text-muted">
                {storyboardJob
                  ? "Try again — this creates a new generation request."
                  : "No storyboard yet. This breaks the script into a scene list — narration, a visual description, audio direction, and an estimated duration per scene — that you can edit and reorder before voice or visuals are generated from it."}
              </p>
              <GenerateStoryboardForm
                projectId={project.id}
                disabledReason={
                  !script
                    ? "Generate a script first — the storyboard is built from it."
                    : !storyboardProvider.isConfigured()
                      ? "Storyboard generation isn't connected yet — add ANTHROPIC_API_KEY to your environment and restart the app."
                      : null
                }
                requestAction={requestStoryboard}
              />
            </div>
          )
        )}
      </StepSection>

      <StepSection id="voice" title="Voice" state={stepState.get("voice")!}>
        {voiceJob?.status === "awaiting_confirmation" && voiceCost && (
          <JobConfirmCard
            jobId={voiceJob.id}
            estimatedCostCents={voiceCost.estimatedCostCents}
            provider={voiceJob.provider}
            model={voiceJob.model}
            label="voice generation"
            confirmAction={confirmVoice}
            cancelAction={cancelVoice}
          />
        )}
        {voiceJob?.status === "running" && isStalled(voiceJob) && (
          <StalledJobCard jobId={voiceJob.id} label="Voice generation" retryAction={retryVoice} />
        )}
        {voiceJob?.status === "failed" && (
          <Alert tone="danger" title="Voice generation failed">
            {voiceJob.error}
          </Alert>
        )}

        {voicePlaybackUrl ? (
          <div className="rounded-xl border border-border bg-surface p-4">
            <audio controls preload="none" src={voicePlaybackUrl} className="w-full" />
            <p className="mt-2 text-xs text-muted">
              {voiceAsset?.provider} ·{" "}
              {(voiceAsset?.metadata as { characterCount?: number } | null)?.characterCount ?? "?"} characters
            </p>
          </div>
        ) : (
          (!voiceJob || voiceJob.status === "failed" || voiceJob.status === "cancelled") && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
              <p className="text-sm text-muted">
                {voiceJob
                  ? "Try again — this creates a new generation request."
                  : "No voice track yet. This narrates the full scene list as one audio file."}
              </p>
              <GenerateVoiceForm
                projectId={project.id}
                disabledReason={
                  projectScenes.length === 0
                    ? "Generate a storyboard first — voice narration is built from the scene list."
                    : !ttsProvider.isConfigured()
                      ? "Voice generation isn't connected yet — add ELEVENLABS_API_KEY to your environment and restart the app."
                      : !storageProvider.isConfigured()
                        ? "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app."
                        : null
                }
              />
            </div>
          )
        )}
      </StepSection>

      <StepSection id="visual" title="Visuals" state={stepState.get("visual")!}>
        {visualJob?.status === "awaiting_confirmation" && visualCost && (
          <JobConfirmCard
            jobId={visualJob.id}
            estimatedCostCents={visualCost.estimatedCostCents}
            provider={visualJob.provider}
            model={visualJob.model}
            label="visual generation"
            confirmAction={confirmVisual}
            cancelAction={cancelVisual}
          />
        )}
        {visualJob?.status === "running" && isStalled(visualJob) && (
          <StalledJobCard jobId={visualJob.id} label="Visual generation" retryAction={retryVisual} />
        )}
        {visualJob?.status === "failed" && (
          <Alert tone="danger" title="Visual generation failed">
            {visualJob.error}
          </Alert>
        )}

        {visualAssets.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {projectScenes.map((scene, index) => {
              const visual = visualsBySceneId.get(scene.id);
              if (!visual) return null;
              const warning = continuityWarningsBySceneId.get(scene.id);
              return (
                <div key={scene.id} className="flex flex-col gap-2">
                  <div className="rounded-lg border border-border bg-surface p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset */}
                    <img
                      src={visual.url}
                      alt={`Generated visual for scene ${index + 1}`}
                      loading="lazy"
                      className="aspect-square w-full rounded object-cover"
                    />
                    <p className="mt-1 text-xs text-muted">Scene {index + 1}</p>
                  </div>
                  {warning && <ContinuityWarningsCard checkId={warning.id} warnings={warning.warnings} />}
                </div>
              );
            })}
          </div>
        )}

        {scenesRemaining > 0 &&
          (!visualJob || visualJob.status === "failed" || visualJob.status === "cancelled") && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
              <p className="text-sm text-muted">
                {visualAssets.length > 0
                  ? `${scenesRemaining} scene${scenesRemaining === 1 ? "" : "s"} still need${scenesRemaining === 1 ? "s" : ""} a visual.`
                  : "No visuals yet. Generates a still image per scene — animating these into video comes later."}
              </p>
              <GenerateVisualForm
                projectId={project.id}
                disabledReason={
                  projectScenes.length === 0
                    ? "Generate a storyboard first — visuals are built from the scene list."
                    : !imageProvider.isConfigured()
                      ? "Visual generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app."
                      : !storageProvider.isConfigured()
                        ? "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app."
                        : null
                }
              />
            </div>
          )}
      </StepSection>

      <StepSection id="animation" title="Animation" state={stepState.get("animation")!}>
        {animationJob?.status === "awaiting_confirmation" && animationCost && (
          <JobConfirmCard
            jobId={animationJob.id}
            estimatedCostCents={animationCost.estimatedCostCents}
            provider={animationJob.provider}
            model={animationJob.model}
            label="animation"
            confirmAction={confirmAnimation}
            cancelAction={cancelAnimation}
          />
        )}
        {animationJob?.status === "running" && isStalled(animationJob) && (
          <StalledJobCard jobId={animationJob.id} label="Animation" retryAction={retryAnimation} />
        )}
        {animationJob?.status === "failed" && (
          <Alert tone="danger" title="Animation failed">
            {animationJob.error}
          </Alert>
        )}

        {animationAssets.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {projectScenes.map((scene, index) => {
              const animation = animationsBySceneId.get(scene.id);
              if (!animation) return null;
              return (
                <div key={scene.id} className="rounded-lg border border-border bg-surface p-2">
                  <video controls preload="none" src={animation.url} className="w-full rounded" />
                  <p className="mt-1 text-xs text-muted">Scene {index + 1}</p>
                </div>
              );
            })}
          </div>
        )}

        {scenesAnimatable.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Generate a visual for at least one scene first — animation turns an existing image into a short video.
          </p>
        ) : (
          scenesRemainingForAnimation > 0 &&
          (!animationJob || animationJob.status === "failed" || animationJob.status === "cancelled") && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
              <p className="text-sm text-muted">
                {animationAssets.length > 0
                  ? `${scenesRemainingForAnimation} scene${scenesRemainingForAnimation === 1 ? "" : "s"} with a visual still need${scenesRemainingForAnimation === 1 ? "s" : ""} animation.`
                  : "No animations yet. Turns each scene's still image into a 5-10 second video clip."}
              </p>
              <GenerateAnimationForm
                projectId={project.id}
                disabledReason={
                  !videoProvider.isConfigured()
                    ? "Animation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app."
                    : !storageProvider.isConfigured()
                      ? "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app."
                      : null
                }
              />
            </div>
          )
        )}
      </StepSection>

      <StepSection id="assembly" title="Final video" state={stepState.get("assembly")!}>
        {assemblyJob?.status === "awaiting_confirmation" && assemblyCost && (
          <JobConfirmCard
            jobId={assemblyJob.id}
            estimatedCostCents={assemblyCost.estimatedCostCents}
            provider={assemblyJob.provider}
            model={assemblyJob.model}
            label="video assembly"
            confirmAction={confirmAssembly}
            cancelAction={cancelAssembly}
          />
        )}
        {assemblyJob?.status === "running" && isStalled(assemblyJob) && (
          <StalledJobCard jobId={assemblyJob.id} label="Video assembly" retryAction={retryAssembly} />
        )}
        {assemblyJob?.status === "failed" && (
          <Alert tone="danger" title="Video assembly failed">
            {assemblyJob.error}
          </Alert>
        )}

        {finalVideoUrl ? (
          <div className="rounded-xl border border-border bg-surface p-4">
            <video controls preload="none" src={finalVideoUrl} className="w-full rounded" />
            <p className="mt-2 text-xs text-muted">{finalVideoAsset?.provider}</p>
          </div>
        ) : (
          (!assemblyJob || assemblyJob.status === "failed" || assemblyJob.status === "cancelled") && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
              <p className="text-sm text-muted">
                {assemblyJob
                  ? "Try again — this creates a new render request."
                  : "Composites every scene's clip (animated if available, else the still image), the voice track, and burned-in captions into one MP4."}
              </p>
              <GenerateAssemblyForm
                projectId={project.id}
                disabledReason={
                  !voiceAssetForAssembly
                    ? "Generate a voice track first — the final video needs narration audio."
                    : scenesMissingVisual > 0
                      ? `${scenesMissingVisual} scene${scenesMissingVisual === 1 ? "" : "s"} still ${scenesMissingVisual === 1 ? "needs" : "need"} a visual.`
                      : !assemblyProvider.isConfigured()
                        ? "Video assembly isn't connected yet — add SHOTSTACK_API_KEY to your environment and restart the app."
                        : !storageProvider.isConfigured()
                          ? "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app."
                          : null
                }
              />
            </div>
          )
        )}
      </StepSection>

      <StepSection id="thumbnail" title="Thumbnails" state={stepState.get("thumbnail")!}>
        {thumbnailJob?.status === "awaiting_confirmation" && thumbnailCost && (
          <JobConfirmCard
            jobId={thumbnailJob.id}
            estimatedCostCents={thumbnailCost.estimatedCostCents}
            provider={thumbnailJob.provider}
            model={thumbnailJob.model}
            label="thumbnail generation"
            confirmAction={confirmThumbnails}
            cancelAction={cancelThumbnails}
          />
        )}
        {thumbnailJob?.status === "running" && isStalled(thumbnailJob) && (
          <StalledJobCard jobId={thumbnailJob.id} label="Thumbnail generation" retryAction={retryThumbnails} />
        )}
        {thumbnailJob?.status === "failed" && (
          <Alert tone="danger" title="Thumbnail generation failed">
            {thumbnailJob.error}
          </Alert>
        )}

        {thumbnailCards.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {thumbnailCards.map(({ thumbnail, url }) => (
              <ThumbnailCard
                key={thumbnail.id}
                thumbnailId={thumbnail.id}
                imageUrl={url}
                style={thumbnail.style}
                headlineText={thumbnail.headlineText}
              />
            ))}
          </div>
        )}

        {(!thumbnailJob || thumbnailJob.status === "failed" || thumbnailJob.status === "cancelled") && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
            <p className="text-sm text-muted">
              {thumbnailCards.length > 0
                ? "Generate more styles, or edit the headline text on any thumbnail above (free — no new image is generated)."
                : "No thumbnails yet. Generates several style options with an editable headline overlay."}
            </p>
            <GenerateThumbnailsForm
              projectId={project.id}
              disabledReason={
                !imageProvider.isConfigured()
                  ? "Thumbnail generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app."
                  : !storageProvider.isConfigured()
                    ? "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app."
                    : null
              }
            />
          </div>
        )}
      </StepSection>

      <section className={SECTION_CLASS}>
        <h2 className="text-sm font-semibold text-muted">Export</h2>
        {script || projectScenes.length > 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">
              A .zip with everything generated so far — script, scene list, SRT/VTT captions, voice track, still
              visuals, animated clips, and the assembled final video if one exists.
            </p>
            <Button href={`/api/projects/${project.id}/export`} variant="secondary" size="sm">
              Download package
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">Nothing to export yet.</p>
        )}
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-sm font-semibold text-muted">Generation jobs</h2>
        <JobNotifications
          projectId={project.id}
          initialJobs={jobs.map((job) => ({ id: job.id, type: job.type, status: job.status }))}
        />
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm"
            >
              <span className="text-foreground">
                {jobTypeLabel(job.type)} · {job.provider}
              </span>
              <Badge tone={jobStatusTone(job.status)} dot>
                {jobStatusLabel(job.status)}
              </Badge>
            </li>
          ))}
        </ul>
        {jobs.some((job) => job.status === "failed" && job.error) && (
          <p className="text-xs text-danger">{jobs.find((job) => job.status === "failed")?.error}</p>
        )}
      </section>

      <p className="text-xs text-muted">
        Thumbnail export dimensions match each platform&apos;s recommended size; background removal isn&apos;t supported
        yet.
      </p>
    </div>
  );
}
