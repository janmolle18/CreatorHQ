import { clips } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { execa } from "execa";
import { rm } from "node:fs/promises";
import { logger } from "../logger.ts";
import type { ClipJob } from "../queues.ts";
import { downloadKeyToTmp } from "../integrations/storage.ts";
import { imAuftragsMandanten } from "../tenant.ts";

// 9:16 = 0.5625 — kleine Toleranz für Encoder-Rundungen (z. B. 1080x1918).
const TARGET_ASPECT = 9 / 16;
const ASPECT_TOLERANCE = 0.02;

/**
 * ffprobe-Validierung importierter Clips (fertige Instagram-Clips):
 * Dauer + Seitenverhältnis erfassen. Nicht-9:16 bleibt nutzbar, wird aber
 * markiert — Blur-Reframe per Render-Job kommt in Phase 4.
 */
export async function processValidateImport(job: Job<ClipJob>): Promise<void> {
  const { clipId } = job.data;
  await imAuftragsMandanten(job, async (db) => {
    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
    if (!clip || clip.origin !== "imported" || !clip.renderedPath) return;

    const localPath = await downloadKeyToTmp(
      clip.renderedPath,
      `validate-${clipId}.mp4`,
    );
    try {
      const { stdout } = await execa("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        localPath,
      ]);
      const probe = JSON.parse(stdout) as {
        streams?: Array<{ width?: number; height?: number }>;
        format?: { duration?: string };
      };
      const width = probe.streams?.[0]?.width ?? 0;
      const height = probe.streams?.[0]?.height ?? 0;
      const duration = parseFloat(probe.format?.duration ?? "0") || 0;

      const aspectOk =
        width > 0 &&
        height > 0 &&
        Math.abs(width / height - TARGET_ASPECT) <= ASPECT_TOLERANCE;

      await db
        .update(clips)
        .set({
          startSeconds: 0,
          endSeconds: duration,
          error: aspectOk
            ? null
            : `Kein 9:16-Format (${width}x${height}) — wird trotzdem verwendet`,
          updatedAt: new Date(),
        })
        .where(eq(clips.id, clipId));

      logger.info(
        { clipId, width, height, duration, aspectOk },
        "validate-import: geprüft",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message.slice(0, 500) : String(err);
      await db
        .update(clips)
        .set({
          status: "failed",
          error: `ffprobe fehlgeschlagen: ${message}`,
          updatedAt: new Date(),
        })
        .where(eq(clips.id, clipId));
      throw err;
    } finally {
      await rm(localPath, { force: true });
    }
  });
}
