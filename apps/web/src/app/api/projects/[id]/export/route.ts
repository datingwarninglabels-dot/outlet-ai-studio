import { asc, desc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { mediaAssets, scenes, scripts } from "@/db/schema";
import { loadOwnedProject } from "@/lib/authz";
import { buildSrt, buildVtt } from "@/lib/captions";
import { storageProvider } from "@/lib/storage-instance";

// This is a free operation — it only packages assets already generated
// (and already paid for) elsewhere, so unlike everything on the project
// page it doesn't go through the cost-confirmation gate.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let project;
  try {
    project = await loadOwnedProject(id, session.user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const assets = await db.select().from(mediaAssets).where(eq(mediaAssets.projectId, project.id));

  if (!script && projectScenes.length === 0 && assets.length === 0) {
    return NextResponse.json({ error: "Nothing generated yet for this project." }, { status: 400 });
  }

  const zip = new JSZip();

  zip.file(
    "README.txt",
    [
      `Outlet AI Studio export — ${project.title}`,
      `Platform: ${project.platform ?? "unspecified"}`,
      "",
      "This package contains everything generated for this project so far,",
      "including final-video.mp4 (the assembled video) if one has been",
      "generated on the project page — otherwise there's no assembled video",
      "here, just the raw clips/audio/captions to assemble yourself.",
      "",
      "captions.srt/.vtt: one caption per scene, timed from each scene's",
      "estimated duration — not word-level synced, since there's no speech",
      "alignment against the actual generated audio yet.",
    ].join("\n"),
  );

  if (script) {
    zip.file(
      "script.txt",
      `${script.content}\n\n---\n${script.provider}/${script.model}\n`,
    );
  }

  if (projectScenes.length > 0) {
    const totalSeconds = projectScenes.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
    zip.file(
      "scenes.txt",
      [
        `${projectScenes.length} scenes, ~${totalSeconds}s total`,
        "",
        ...projectScenes.map(
          (s, i) =>
            `Scene ${i + 1} (${s.durationSeconds ?? "?"}s)\n` +
            `Narration: ${s.narration}\n` +
            `Visual: ${s.visualDescription}\n` +
            `Audio direction: ${s.audioDirection ?? "none"}\n`,
        ),
      ].join("\n---\n\n"),
    );

    zip.file("captions.srt", buildSrt(projectScenes));
    zip.file("captions.vtt", buildVtt(projectScenes));
  }

  for (const asset of assets) {
    try {
      const bytes = await storageProvider.getObject(asset.storageKey);
      const filename =
        asset.type === "voice_audio"
          ? "voice.mp3"
          : asset.type === "scene_image"
            ? `visual-scene-${asset.sceneId ?? asset.id}.${asset.contentType.includes("png") ? "png" : "jpg"}`
            : asset.type === "scene_video"
              ? `animation-scene-${asset.sceneId ?? asset.id}.${asset.contentType.includes("mp4") ? "mp4" : "mov"}`
              : asset.type === "final_video"
                ? "final-video.mp4"
                : `${asset.type}-${asset.id}`;
      zip.file(filename, bytes);
    } catch {
      // Storage may have been reconfigured since this asset was generated —
      // skip it rather than failing the whole export.
      zip.file(`MISSING-${asset.type}.txt`, `Could not retrieve this file from storage (key: ${asset.storageKey}).`);
    }
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const safeTitle = project.title.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60) || "export";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle}.zip"`,
    },
  });
}
