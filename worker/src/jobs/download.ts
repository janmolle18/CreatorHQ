import { sourceVideos } from "@creatorhq/db";
import {
  classifySource,
  classificationReason,
  speicherSchluessel,
} from "@creatorhq/shared";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { execa } from "execa";
import { mkdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import { queues, reiheEinmalEin, type SourceVideoJob } from "../queues.ts";
import { uploadFile, TMP_DIR } from "../integrations/storage.ts";
import { markSourceAsReference } from "./reference.ts";
import { imAuftragsMandanten } from "../tenant.ts";

/** true, wenn cookies.txt echte Cookie-Zeilen enthält (nicht nur Kommentare/leer). */
function hasCookies(): boolean {
  try {
    return readFileSync(env.paths.cookies, "utf8")
      .split("\n")
      .some((l) => l.trim() && !l.trim().startsWith("#"));
  } catch {
    return false;
  }
}

/**
 * Lädt das Quell-Video per yt-dlp herunter und speichert es in MinIO.
 * Aus ClipPilot übernommen; ohne streamerId, Clip-Anstoß folgt in Phase 4.
 */
export async function processDownload(job: Job<SourceVideoJob>): Promise<void> {
  const { sourceVideoId } = job.data;
  await imAuftragsMandanten(job, async (db, tenantId) => {
    const [video] = await db
      .select()
      .from(sourceVideos)
      .where(eq(sourceVideos.id, sourceVideoId));
    if (!video || !video.url) return;

    await db
      .update(sourceVideos)
      .set({ status: "downloading", updatedAt: new Date() })
      .where(eq(sourceVideos.id, sourceVideoId));
    await mkdir(TMP_DIR, { recursive: true });

    const outTemplate = path.join(TMP_DIR, `${sourceVideoId}.%(ext)s`);
    try {
      // 720p mp4 reicht für vertikale Clips und spart Speicher/Zeit
      const cookies = hasCookies() ? ["--cookies", env.paths.cookies] : [];
      await execa(env.paths.ytdlp, [
        "-f",
        "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        "--merge-output-format",
        "mp4",
        "--js-runtimes",
        "node", // YouTube braucht inzwischen eine JS-Runtime
        "--no-progress",
        "--retries",
        "10",
        "--fragment-retries",
        "10",
        ...cookies,
        "-o",
        outTemplate,
        video.url,
      ]);
      const localPath = path.join(TMP_DIR, `${sourceVideoId}.mp4`);

      const { stdout } = await execa("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        localPath,
      ]);
      const duration = Math.round(parseFloat(stdout.trim()) || 0);

      // Erst hier steht die echte Dauer fest. Ist es ein fertiges Kurzvideo,
      // sparen wir uns Ablage und Whisper-Lauf komplett — es zählt nur für die
      // Analyse. (Die eigentliche Sperre sitzt zusätzlich im Clip-Job.)
      if (classifySource({ durationSeconds: duration }) === "reference") {
        await rm(localPath, { force: true });
        await db
          .update(sourceVideos)
          .set({ durationSeconds: duration, updatedAt: new Date() })
          .where(eq(sourceVideos.id, sourceVideoId));
        await markSourceAsReference(db, {
          sourceVideoId,
          storagePath: video.storagePath,
          reason: classificationReason({ durationSeconds: duration }),
        });
        return;
      }

      const key = speicherSchluessel(
        tenantId,
        "sources",
        `${sourceVideoId}.mp4`,
      );
      await uploadFile(localPath, key);

      await db
        .update(sourceVideos)
        .set({
          status: "downloaded",
          storagePath: key,
          durationSeconds: duration,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(sourceVideos.id, sourceVideoId));

      // reiheEinmalEin statt add: BullMQ verwirft ein `add` mit BEKANNTER
      // Kennung stillschweigend — auch wenn der alte Auftrag längst fertig
      // oder gescheitert ist. Bei einem zweiten Anlauf derselben Quelle ginge
      // der Schnitt so verloren, und die Quelle bliebe auf `downloaded` stehen.
      await reiheEinmalEin(
        queues.clip,
        "clip",
        { tenantId, sourceVideoId },
        `clip-${sourceVideoId}`,
      );
      logger.info(
        { sourceVideoId, duration },
        "download: fertig, Clipping eingereiht",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message.slice(0, 500) : String(err);
      logger.error({ err, sourceVideoId }, "download: fehlgeschlagen");
      await db
        .update(sourceVideos)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(sourceVideos.id, sourceVideoId));
      throw err;
    }
  });
}
