import { db } from "@/db";
import { generationJobs, mediaAssets } from "@/db/schema";
import { completeJob, completeStep, failJob, failStep, publicErrorMessage, startStep, withRetry } from "@/lib/jobs";
import { ttsProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// projects/[id]/actions.ts.
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

export async function executeVoiceJob(job: ProjectJob): Promise<string | null> {
  const stepId = await startStep(job.id, "generate_voice", 0);

  try {
    const params = job.params as { narration: string; voiceId?: string };
    const result = await withRetry(() => ttsProvider.generate({ text: params.narration, voiceId: params.voiceId }));

    const storageKey = `projects/${job.projectId}/voice/${job.id}.mp3`;
    const uploaded = await storageProvider.putObject({
      key: storageKey,
      body: result.audio,
      contentType: result.contentType,
    });

    await db.insert(mediaAssets).values({
      projectId: job.projectId,
      jobId: job.id,
      type: "voice_audio",
      storageKey: uploaded.key,
      contentType: result.contentType,
      sizeBytes: uploaded.sizeBytes,
      provider: result.provider,
      model: result.model,
      metadata: { characterCount: result.characterCount },
    });

    await completeStep(stepId, { characterCount: result.characterCount, sizeBytes: uploaded.sizeBytes });
    await completeJob(job.id);
    return null;
  } catch (err) {
    const publicMsg = publicErrorMessage(err);
    await failStep(stepId, publicMsg);
    await failJob(job.id, publicMsg, err instanceof Error ? (err.stack ?? err.message) : String(err));
    return publicMsg;
  }
}

export const voiceJobTask = defineJobTask<ProjectJob>({
  id: "execute-voice-job",
  maxDuration: 300,
  executor: executeVoiceJob,
});
