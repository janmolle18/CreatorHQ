import { db, clips, sourceVideos } from "@creatorhq/db";
import { and, eq, inArray } from "drizzle-orm";
import type { Job } from "bullmq";
import { execa } from "execa";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger.ts";
import { queues } from "../queues.ts";
import { downloadKeyToTmp, uploadFile, TMP_DIR } from "../integrations/storage.ts";
import { srtToAss } from "./subtitle-style.ts";

export interface RenderJob {
  clipId: string;
  /** true = neu rendern, auch wenn schon eine Datei existiert (Re-Render). */
  force?: boolean;
  /**
   * Nur für importierte Clips: erzwingt den Blur-Reframe und damit ein
   * Neu-Enkodieren. Bewusst ein eigenes Flag — `force` aus dem „Neu rendern“-
   * Knopf darf fertige Instagram-Clips NICHT anfassen.
   */
  reframe?: boolean;
}

/**
 * Zustände, aus denen heraus gerendert werden darf.
 *
 * Ohne diese Sperre konnte ein aussortierter Clip live gehen: „Aussortieren"
 * setzt `rejected`, der bereits laufende Render-Job schrieb danach
 * bedingungslos `rendered` zurück, und der Sweep plante ihn zur
 * Veröffentlichung ein. Zwei Browser, ein stehengebliebener Tab oder der
 * geteilte Login genügen dafür.
 */
const RENDERBAR = ["approved", "rendering", "rendered"] as const;

/**
 * Rendert einen freigegebenen Clip auf 9:16 (unscharfer Hintergrund + zentriertes
 * Video) und brennt die SRT-Untertitel ein. 1:1 aus ClipPilot (erprobter Filter);
 * erweitert um `force` für Re-Render und Blur-Reframe importierter Clips.
 */
export async function processRender(job: Job<RenderJob>): Promise<void> {
  const { clipId, force, reframe } = job.data;
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
  if (!clip) return;

  if (!RENDERBAR.includes(clip.status as (typeof RENDERBAR)[number])) {
    logger.info(
      { clipId, status: clip.status },
      "render: übersprungen — Clip ist nicht (mehr) freigegeben"
    );
    return;
  }

  // Harte Sperre: importierte Clips (Instagram & Co.) sind fertige Videos.
  // Sie werden veröffentlicht wie sie sind — nie neu enkodiert, damit Davids
  // Originalqualität erhalten bleibt. Nur ein ausdrückliches reframe-Flag
  // öffnet den Blur-Reframe; der „Neu rendern“-Knopf setzt es nicht.
  if (clip.origin === "imported" && !reframe) {
    if (!clip.renderedPath) throw new Error("Importierter Clip ohne Datei");
    await db
      .update(clips)
      .set({ status: "rendered", updatedAt: new Date() })
      .where(and(eq(clips.id, clipId), inArray(clips.status, [...RENDERBAR])));
    logger.info({ clipId }, "render: importierter Clip bleibt im Original — kein Re-Encode");
    return;
  }

  // Bereits gerendert und kein Re-Render angefordert → nur Status sicherstellen.
  if (clip.renderedPath && !force) {
    await db
      .update(clips)
      .set({ status: "rendered", updatedAt: new Date() })
      .where(and(eq(clips.id, clipId), inArray(clips.status, [...RENDERBAR])));
    return;
  }

  // Quelle bestimmen: Pipeline-Clips schneiden aus dem Quellvideo,
  // importierte Clips reframen ihre eigene Datei (kompletter Zeitraum).
  let src: string;
  let trimArgs: string[];
  if (clip.origin === "imported") {
    if (!clip.renderedPath) throw new Error("Importierter Clip ohne Datei");
    src = await downloadKeyToTmp(clip.renderedPath, `reframe-${clipId}.mp4`);
    trimArgs = [];
  } else {
    if (clip.sourceVideoId === null || clip.startSeconds === null || clip.endSeconds === null) {
      throw new Error("Pipeline-Clip ohne Quellvideo/Zeitfenster");
    }
    const [video] = await db
      .select()
      .from(sourceVideos)
      .where(eq(sourceVideos.id, clip.sourceVideoId));
    if (!video?.storagePath) throw new Error("Quell-Video fehlt für Render");
    src = await downloadKeyToTmp(video.storagePath, `${video.id}.mp4`);
    trimArgs = ["-ss", String(clip.startSeconds), "-to", String(clip.endSeconds)];
  }

  // Anspruch aufs Rendern — wer zwischen Job-Start und hier aussortiert hat,
  // gewinnt. Ohne das läuft ffmpeg minutenlang für einen verworfenen Clip.
  const [beansprucht] = await db
    .update(clips)
    .set({ status: "rendering", updatedAt: new Date() })
    .where(and(eq(clips.id, clipId), inArray(clips.status, [...RENDERBAR])))
    .returning({ id: clips.id });

  if (!beansprucht) {
    logger.info({ clipId }, "render: abgebrochen — Clip wurde inzwischen aussortiert");
    return;
  }

  const out = path.join(TMP_DIR, `clip-${clipId}.mp4`);
  const assPath = path.join(TMP_DIR, `clip-${clipId}.ass`);

  // Untertitel einbrennen — als ASS mit eingebettetem TikTok-Stil.
  // ffmpeg ≥ 7 parst Pfade mit Leerzeichen/Kommas im Filtergraph nicht mehr
  // zuverlässig (auch gequotet) → ffmpeg läuft mit cwd=TMP_DIR und der Filter
  // referenziert nur den relativen Dateinamen ohne Sonderzeichen.
  let lastStage = "[ov]copy[outv]";
  if (clip.subtitles && clip.subtitles.trim()) {
    await writeFile(assPath, srtToAss(clip.subtitles), "utf8");
    lastStage = `[ov]ass=${path.basename(assPath)}[outv]`;
  }

  const filter = [
    "[0:v]split=2[bg][fg]",
    // Blur auf kleiner Auflösung (≈15× schneller), dann hochskalieren – sieht gleich aus.
    "[bg]scale=288:512:force_original_aspect_ratio=increase,crop=288:512,boxblur=10:2,scale=1080:1920[bgb]",
    "[fg]scale=1080:-2[fgs]",
    "[bgb][fgs]overlay=(W-w)/2:(H-h)/2[ov]",
    lastStage,
  ].join(";");

  try {
    await execa(
      "ffmpeg",
      [
        "-y",
        ...trimArgs,
        "-i", src,
        "-filter_complex", filter,
        "-map", "[outv]",
        "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        // Loudness auf Social-Standard (−16 LUFS) → kein Leise-/Laut-Gefälle zwischen Clips.
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "48000",
        "-c:a", "aac", "-b:a", "128k",
        "-r", "30",
        out,
      ],
      { cwd: TMP_DIR }
    );

    const key = `clips/${clipId}.mp4`;
    await uploadFile(out, key);
    const [aktualisiert] = await db
      .update(clips)
      .set({ status: "rendered", renderedPath: key, error: null, updatedAt: new Date() })
      .where(and(eq(clips.id, clipId), inArray(clips.status, [...RENDERBAR])))
      .returning({ id: clips.id });

    // Wurde der Clip während des Renderns aussortiert, endet es hier: Datei
    // liegt im Speicher, aber es wird nichts eingeplant.
    if (!aktualisiert) {
      logger.info({ clipId }, "render: fertig, aber zwischenzeitlich aussortiert — nicht eingeplant");
      return;
    }
    await queues.maintenance.add(
      "schedule",
      { clipId },
      { jobId: `schedule-${clipId}` }
    );
    logger.info({ clipId, key }, "render: 9:16-Clip fertig, Scheduling eingereiht");
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
    logger.error({ err, clipId }, "render: fehlgeschlagen");
    await db
      .update(clips)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(clips.id, clipId));
    throw err;
  } finally {
    await rm(out, { force: true });
    await rm(assPath, { force: true });
  }
}
