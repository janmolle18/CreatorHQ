"use server";

import { db, sourceVideos } from "@creatorhq/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { parseTwitchVodId, parseYoutubeVideoId } from "@/lib/parse";
import { downloadQueue, maintenanceQueue } from "@/lib/queues";

export async function addSourceAction(formData: FormData): Promise<void> {
  await requireSession();
  const input = String(formData.get("url") ?? "").trim();
  if (!input) redirect("/sources?error=Bitte%20einen%20Link%20einf%C3%BCgen");

  const youtubeId = parseYoutubeVideoId(input);
  const twitchVodId = youtubeId ? null : parseTwitchVodId(input);
  if (!youtubeId && !twitchVodId) {
    redirect(
      "/sources?error=" +
        encodeURIComponent("Kein YouTube-Video- oder Twitch-VOD-Link erkannt")
    );
  }

  const values = youtubeId
    ? {
        sourceKind: "youtube_video" as const,
        platform: "youtube" as const,
        externalId: youtubeId,
        url: `https://www.youtube.com/watch?v=${youtubeId}`,
      }
    : {
        sourceKind: "twitch_vod" as const,
        platform: "twitch" as const,
        externalId: twitchVodId!,
        url: `https://www.twitch.tv/videos/${twitchVodId}`,
      };

  const inserted = await db
    .insert(sourceVideos)
    .values({ ...values, status: "discovered" })
    .onConflictDoNothing()
    .returning({ id: sourceVideos.id });

  // Direkt einreihen (jobId dedupliziert); der ingest-tick ist das Sicherheitsnetz.
  if (inserted[0]) {
    await downloadQueue().add(
      "download",
      { sourceVideoId: inserted[0].id },
      { jobId: `download-${inserted[0].id}` }
    );
  }

  revalidatePath("/sources");
  redirect(inserted[0] ? "/sources?added=1" : "/sources?exists=1");
}

export async function scanChannelAction(): Promise<void> {
  await requireSession();
  await maintenanceQueue().add("scan-channel", {}, { jobId: `scan-${Date.now()}` });
  revalidatePath("/sources");
  redirect("/sources?scan=1");
}

export async function createClipsAction(formData: FormData): Promise<void> {
  await requireSession();
  const sourceVideoId = String(formData.get("sourceVideoId") ?? "");
  if (!sourceVideoId) return;

  const { clipQueue } = await import("@/lib/queues");
  await clipQueue().add(
    "clip",
    { sourceVideoId },
    { jobId: `clip-manual-${sourceVideoId}-${Date.now()}` }
  );
  revalidatePath("/sources");
  redirect("/sources?clipping=1");
}
