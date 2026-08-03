import { db, clips, settings } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { logger } from "../logger.ts";
import type { ClipJob } from "../queues.ts";
import { generateCaption } from "../integrations/llm.ts";

/**
 * Erzeugt Caption + Hashtags für einen Clip-Kandidaten (Claude, sonst Heuristik).
 * Danach bleibt der Clip im Status "candidate" und wartet auf Freigabe im
 * Dashboard (Mensch im Loop).
 */
export async function processEnrich(job: Job<ClipJob>): Promise<void> {
  const { clipId } = job.data;
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
  if (!clip) return;

  // Nur generieren, wenn noch nichts vorhanden ist.
  if (clip.caption && clip.hashtags.length > 0) return;

  const [config] = await db.select().from(settings).limit(1);
  const creatorName = config?.creatorName ?? "David";

  const { caption, hashtags, source } = await generateCaption(
    clip.transcript ?? "",
    creatorName
  );
  await db
    .update(clips)
    .set({
      caption: clip.caption ?? caption,
      hashtags: clip.hashtags.length > 0 ? clip.hashtags : hashtags,
      updatedAt: new Date(),
    })
    .where(eq(clips.id, clipId));

  logger.info({ clipId, source, caption }, "enrich: Caption gesetzt – wartet auf Freigabe");
}
