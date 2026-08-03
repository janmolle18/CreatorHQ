"use server";

import { sourceVideos } from "@creatorhq/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mitMandant, requireSession } from "@/lib/auth";
import { parseTwitchVodId, parseYoutubeVideoId } from "@/lib/parse";
import { downloadQueue, maintenanceQueue } from "@/lib/queues";

export async function addSourceAction(formData: FormData): Promise<void> {
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

  // Die Eindeutigkeit greift jetzt je Mandant: Zwei Creator duerfen dasselbe
  // oeffentliche Video als Quelle haben, ohne sich zu blockieren.
  const { neu, tenantId } = await mitMandant(async (tx, session) => {
    const eingefuegt = await tx
      .insert(sourceVideos)
      .values({ tenantId: session.tenantId, ...values, status: "discovered" })
      .onConflictDoNothing()
      .returning({ id: sourceVideos.id });
    return { neu: eingefuegt[0] ?? null, tenantId: session.tenantId };
  });

  // Direkt einreihen (jobId dedupliziert); der ingest-tick ist das Sicherheitsnetz.
  if (neu) {
    await downloadQueue().add(
      "download",
      { tenantId, sourceVideoId: neu.id },
      { jobId: `download-${neu.id}` }
    );
  }

  revalidatePath("/sources");
  redirect(neu ? "/sources?added=1" : "/sources?exists=1");
}

export async function scanChannelAction(): Promise<void> {
  const session = await requireSession();
  await maintenanceQueue().add(
    "scan-channel",
    { tenantId: session.tenantId },
    { jobId: `scan-${session.tenantId}-${Date.now()}` }
  );
  revalidatePath("/sources");
  redirect("/sources?scan=1");
}

export async function createClipsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const sourceVideoId = String(formData.get("sourceVideoId") ?? "");
  if (!sourceVideoId) return;

  const { clipQueue } = await import("@/lib/queues");
  await clipQueue().add(
    "clip",
    { tenantId: session.tenantId, sourceVideoId },
    { jobId: `clip-manual-${sourceVideoId}-${Date.now()}` }
  );
  revalidatePath("/sources");
  redirect("/sources?clipping=1");
}
