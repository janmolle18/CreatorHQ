import { sourceVideos, clips } from "@creatorhq/db";
import {
  classifySource,
  classificationReason,
  speicherSchluessel,
} from "@creatorhq/shared";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { execa } from "execa";
import path from "node:path";
import { rm } from "node:fs/promises";
import { logger } from "../logger.ts";
import { env } from "../env.ts";
import { queues, type SourceVideoJob } from "../queues.ts";
import {
  downloadKeyToTmp,
  uploadFile,
  TMP_DIR,
} from "../integrations/storage.ts";
import { getClipProvider } from "../clip/index.ts";
import { transcribeFiles } from "../integrations/transcribe.ts";
import { buildClipSrt } from "./subtitle-cues.ts";
import { markSourceAsReference } from "./reference.ts";
import { imAuftragsMandanten } from "../tenant.ts";

/**
 * Vorschau-Standbild aus der Fenster-Mitte (360px breit) → MinIO thumbs/.
 * Scheitert leise: ein fehlendes Thumbnail darf den Clip-Job nie kippen.
 */
async function createThumb(
  tenantId: string,
  localSource: string,
  clipId: string,
  startSeconds: number,
  endSeconds: number,
): Promise<string | null> {
  const mid = startSeconds + (endSeconds - startSeconds) / 2;
  const local = path.join(TMP_DIR, `thumb-${clipId}.jpg`);
  try {
    await execa("ffmpeg", [
      "-y",
      "-ss",
      String(mid),
      "-i",
      localSource,
      "-frames:v",
      "1",
      "-vf",
      "scale=360:-2",
      "-q:v",
      "4",
      local,
    ]);
    const key = speicherSchluessel(tenantId, "thumbs", `${clipId}.jpg`);
    await uploadFile(local, key);
    return key;
  } catch (err) {
    logger.warn(
      { err, clipId },
      "clip: Thumbnail fehlgeschlagen — Kandidat bleibt ohne Bild",
    );
    return null;
  } finally {
    await rm(local, { force: true });
  }
}

/**
 * Lässt den ClipProvider Highlight-Kandidaten finden, transkribiert die
 * Fenster per Whisper und legt clips (status=candidate) an. Danach Enrichment.
 * Aus ClipPilot übernommen; ohne streamerId.
 */
export async function processClip(job: Job<SourceVideoJob>): Promise<void> {
  const { sourceVideoId } = job.data;
  await imAuftragsMandanten(job, async (db, tenantId) => {
    const [video] = await db
      .select()
      .from(sourceVideos)
      .where(eq(sourceVideos.id, sourceVideoId));
    if (!video || !video.storagePath) return;

    // Harte Sperre: fertige Kurzvideos werden nie zerschnitten. Diese Stelle
    // passiert JEDER Clip-Job — auch der manuelle Klick „Clips erzeugen“, der
    // den Download-Job umgeht. Bewusst sauber zurückkehren statt werfen, sonst
    // versucht BullMQ es dreimal.
    if (classifySource(video) === "reference") {
      await markSourceAsReference(db, {
        sourceVideoId,
        storagePath: video.storagePath,
        reason: classificationReason(video),
      });
      return;
    }

    await db
      .update(sourceVideos)
      .set({ status: "clipping", updatedAt: new Date() })
      .where(eq(sourceVideos.id, sourceVideoId));

    const localSource = await downloadKeyToTmp(
      video.storagePath,
      `${sourceVideoId}.mp4`,
    );
    const provider = getClipProvider();
    const audioFiles: string[] = [];

    try {
      const candidates = await provider.findClips({
        db,
        sourceFilePath: localSource,
        sourceVideoId,
        maxCandidates: env.clip.maxCandidates,
        durationSeconds: video.durationSeconds ?? undefined,
      });

      const finalCandidates = candidates.slice(0, env.clip.maxCandidates);

      // Untertitel: Der Smart-Provider liefert Transkript + SRT direkt aus dem
      // Voll-Transkript. Nur für Kandidaten ohne Transkript (Lautstärke-Fallback)
      // wird das Fenster-Audio einzeln per Whisper transkribiert.
      const subs: Array<{ text: string; srt: string } | undefined> = new Array(
        finalCandidates.length,
      );
      if (env.whisper.enabled && !provider.producesRenderedFile) {
        const idxMap: number[] = [];
        for (let i = 0; i < finalCandidates.length; i++) {
          const candidate = finalCandidates[i]!;
          if (candidate.transcript) continue;
          const wav = path.join(TMP_DIR, `aud-${sourceVideoId}-${i}.wav`);
          await execa("ffmpeg", [
            "-y",
            "-ss",
            String(candidate.startSeconds),
            "-to",
            String(candidate.endSeconds),
            "-i",
            localSource,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            wav,
          ]);
          audioFiles.push(wav);
          idxMap.push(i);
        }
        const results = await transcribeFiles(audioFiles);
        results.forEach((r, k) => {
          subs[idxMap[k]!] = { text: r.text, srt: buildClipSrt(r.segments) };
        });
        logger.info(
          { sourceVideoId, transcribed: audioFiles.length },
          "clip: Untertitel transkribiert",
        );
      }

      for (let i = 0; i < finalCandidates.length; i++) {
        const candidate = finalCandidates[i]!;
        const [clip] = await db
          .insert(clips)
          .values({
            tenantId,
            sourceVideoId,
            origin: "pipeline",
            provider: provider.name,
            startSeconds: candidate.startSeconds,
            endSeconds: candidate.endSeconds,
            score: candidate.score ?? null,
            transcript: subs[i]?.text ?? candidate.transcript ?? null,
            subtitles: subs[i]?.srt ?? candidate.subtitlesSrt ?? null,
            caption: candidate.caption ?? null,
            status: "candidate",
          })
          .returning({ id: clips.id });

        const thumbPath = await createThumb(
          tenantId,
          localSource,
          clip!.id,
          candidate.startSeconds,
          candidate.endSeconds,
        );
        if (thumbPath) {
          await db
            .update(clips)
            .set({ thumbPath })
            .where(eq(clips.id, clip!.id));
        }

        await queues.clip.add("enrich", { tenantId, clipId: clip!.id });
      }

      await db
        .update(sourceVideos)
        .set({ status: "clipped", updatedAt: new Date() })
        .where(eq(sourceVideos.id, sourceVideoId));
      logger.info(
        {
          sourceVideoId,
          provider: provider.name,
          count: finalCandidates.length,
        },
        "clip: Kandidaten erzeugt",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message.slice(0, 500) : String(err);
      logger.error({ err, sourceVideoId }, "clip: fehlgeschlagen");
      await db
        .update(sourceVideos)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(sourceVideos.id, sourceVideoId));
      throw err;
    } finally {
      // Audio-Fenster sofort aufräumen; Quell-mp4 bleibt für Render-Jobs in tmp.
      await Promise.all(audioFiles.map((file) => rm(file, { force: true })));
    }
  });
}
