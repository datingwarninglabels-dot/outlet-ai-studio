import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, mediaAssets, scenes, scripts, usageCosts } from "@/db/schema";
import { isStalled } from "@/lib/jobs";
import { imageProvider, storyboardProvider, ttsProvider, videoProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { loadOwnedProject } from "@/lib/authz";
import {
  cancelAnimation,
  cancelScript,
  cancelStoryboard,
  cancelVisual,
  cancelVoice,
  confirmAnimation,
  confirmScript,
  confirmStoryboard,
  confirmVisual,
  confirmVoice,
  getAnimationUrl,
  getVisualUrl,
  getVoicePlaybackUrl,
  moveScene,
  requestStoryboard,
  retryAnimation,
  retryScript,
  retryStoryboard,
  retryVisual,
  retryVoice,
  updateScene,
} from "./actions";
import { GenerateAnimationForm } from "./animation-form";
import { JobConfirmCard, StalledJobCard } from "./job-cards";
import { GenerateStoryboardForm, SceneEditForm } from "./scene-form";
import { GenerateVisualForm } from "./visual-form";
import { GenerateVoiceForm } from "./voice-form";

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

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, project.id))
    .orderBy(desc(scripts.createdAt))
    .limit(1);

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(asc(scenes.order));

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

  const [scriptCost] = scriptJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, scriptJob.id)).limit(1)
    : [];
  const [storyboardCost] = storyboardJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, storyboardJob.id)).limit(1)
    : [];
  const [voiceCost] = voiceJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, voiceJob.id)).limit(1)
    : [];
  const [visualCost] = visualJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, visualJob.id)).limit(1)
    : [];
  const [animationCost] = animationJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, animationJob.id)).limit(1)
    : [];

  const [voiceAsset] = voiceJob
    ? await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.jobId, voiceJob.id))
        .limit(1)
    : [];
  const voicePlaybackUrl = voiceAsset ? await getVoicePlaybackUrl(voiceAsset.id) : null;

  const visualAssets = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "scene_image")));
  const visualsBySceneId = new Map(
    await Promise.all(
      visualAssets.map(async (asset) => [asset.sceneId, { asset, url: await getVisualUrl(asset.id) }] as const),
    ),
  );
  const scenesRemaining = projectScenes.filter((s) => !visualsBySceneId.has(s.id)).length;

  const animationAssets = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "scene_video")));
  const animationsBySceneId = new Map(
    await Promise.all(
      animationAssets.map(
        async (asset) => [asset.sceneId, { asset, url: await getAnimationUrl(asset.id) }] as const,
      ),
    ),
  );
  const scenesAnimatable = projectScenes.filter((s) => visualsBySceneId.has(s.id));
  const scenesRemainingForAnimation = scenesAnimatable.filter(
    (s) => !animationsBySceneId.has(s.id),
  ).length;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{project.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {project.platform} · {project.status}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Script</h2>
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
          <p className="rounded-lg border border-dashed border-red-400/40 p-6 text-sm text-red-400">
            Script generation failed: {scriptJob.error}. Start a new project from Create Video to try
            again.
          </p>
        )}
        {scriptJob?.status === "cancelled" && (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Script generation was cancelled before it started — no cost was incurred.
          </p>
        )}
        {script ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="whitespace-pre-wrap text-sm">{script.content}</p>
            <p className="mt-4 text-xs text-muted">
              {script.provider}/{script.model} · {script.promptTokens ?? "?"} in /{" "}
              {script.completionTokens ?? "?"} out tokens
            </p>
          </div>
        ) : (
          !scriptJob && (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
              No script generated yet.
            </p>
          )
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Storyboard</h2>

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
          <StalledJobCard
            jobId={storyboardJob.id}
            label="Storyboard generation"
            retryAction={retryStoryboard}
          />
        )}
        {storyboardJob?.status === "failed" && (
          <p className="rounded-lg border border-dashed border-red-400/40 p-6 text-sm text-red-400">
            Storyboard generation failed: {storyboardJob.error}
          </p>
        )}

        {projectScenes.length > 0 ? (
          <div className="flex flex-col gap-3">
            {projectScenes.map((scene, index) => (
              <SceneEditForm
                key={scene.id}
                projectId={project.id}
                scene={{
                  id: scene.id,
                  narration: scene.narration,
                  visualDescription: scene.visualDescription,
                  audioDirection: scene.audioDirection ?? "",
                  durationSeconds: scene.durationSeconds,
                  provider: scene.provider,
                  model: scene.model,
                  version: scene.version,
                }}
                index={index}
                sceneCount={projectScenes.length}
                updateAction={updateScene}
                moveAction={moveScene}
              />
            ))}
            <p className="text-xs text-muted">
              Total estimated runtime:{" "}
              {projectScenes.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)}s across{" "}
              {projectScenes.length} scene{projectScenes.length === 1 ? "" : "s"}.
            </p>
          </div>
        ) : (
          (!storyboardJob ||
            storyboardJob.status === "failed" ||
            storyboardJob.status === "cancelled") && (
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Voice</h2>

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
          <p className="rounded-lg border border-dashed border-red-400/40 p-6 text-sm text-red-400">
            Voice generation failed: {voiceJob.error}
          </p>
        )}

        {voicePlaybackUrl ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <audio controls src={voicePlaybackUrl} className="w-full" />
            <p className="mt-2 text-xs text-muted">
              {voiceAsset?.provider} · {(voiceAsset?.metadata as { characterCount?: number } | null)?.characterCount ?? "?"} characters
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Visual</h2>

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
          <p className="rounded-lg border border-dashed border-red-400/40 p-6 text-sm text-red-400">
            Visual generation failed: {visualJob.error}
          </p>
        )}

        {visualAssets.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {projectScenes.map((scene, index) => {
              const visual = visualsBySceneId.get(scene.id);
              if (!visual) return null;
              return (
                <div key={scene.id} className="rounded-lg border border-border bg-surface p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset */}
                  <img
                    src={visual.url}
                    alt={`Generated visual for scene ${index + 1}`}
                    className="w-full rounded"
                  />
                  <p className="mt-1 text-xs text-muted">Scene {index + 1}</p>
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Animate</h2>

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
          <p className="rounded-lg border border-dashed border-red-400/40 p-6 text-sm text-red-400">
            Animation failed: {animationJob.error}
          </p>
        )}

        {animationAssets.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {projectScenes.map((scene, index) => {
              const animation = animationsBySceneId.get(scene.id);
              if (!animation) return null;
              return (
                <div key={scene.id} className="rounded-lg border border-border bg-surface p-2">
                  <video controls src={animation.url} className="w-full rounded" />
                  <p className="mt-1 text-xs text-muted">Scene {index + 1}</p>
                </div>
              );
            })}
          </div>
        )}

        {scenesAnimatable.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Generate a visual for at least one scene first — animation turns an existing image into a
            short video.
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Export</h2>
        {script || projectScenes.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-muted">
              A .zip with everything generated so far — script, scene list, SRT/VTT captions, voice
              track, still visuals, and animated clips. Not an assembled final video yet.
            </p>
            <a
              href={`/api/projects/${project.id}/export`}
              className="h-11 w-fit rounded-lg border border-border px-4 text-sm font-medium leading-[44px] hover:bg-surface-raised"
            >
              Download package
            </a>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Nothing to export yet.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Generation jobs</h2>
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm"
            >
              <span>
                {job.type} · {job.provider}
              </span>
              <span
                className={
                  job.status === "failed"
                    ? "text-red-400"
                    : job.status === "succeeded"
                      ? "text-accent-teal"
                      : "text-muted"
                }
              >
                {job.status}
              </span>
            </li>
          ))}
        </ul>
        {jobs.some((job) => job.status === "failed" && job.error) && (
          <p className="text-xs text-red-400">{jobs.find((job) => job.status === "failed")?.error}</p>
        )}
      </section>

      <p className="text-xs text-muted">
        Export packages what&apos;s generated so far — it doesn&apos;t assemble a final video from
        the animated clips, voice track, and captions. Thumbnail Studio isn&apos;t wired up yet.
      </p>
    </div>
  );
}
