"use server";

import { db, clips, posts, socialAccounts } from "@creatorhq/db";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { maintenanceQueue, publishQueue } from "@/lib/queues";

/** Zustände, in denen ein Post noch nicht draußen ist (neu planbar/pushbar). */
const PENDING_STATES = ["draft", "scheduled", "awaiting_manual", "failed"] as const;

/**
 * Ein Post, der noch NIRGENDS liegt.
 *
 * `awaiting_manual` allein reicht als Prüfung nicht: Genau diesen Status setzt
 * der YouTube-Pfad **nach erfolgreichem Upload** (privat bis zum bestandenen
 * API-Audit — der dokumentierte Normalzustand), zusammen mit der
 * Plattform-ID. Ohne diese Unterscheidung lud „Alle jetzt hochladen" das Video
 * ein zweites Mal hoch, und „Zeitplan neu bauen" löschte den Post samt
 * Studio-Link.
 */
function nochNirgends(post: { status: string; externalPostId: string | null }): boolean {
  return (
    PENDING_STATES.includes(post.status as (typeof PENDING_STATES)[number]) &&
    post.externalPostId === null
  );
}

const urlSchema = z
  .string()
  .trim()
  .url("Bitte eine gültige URL angeben (https://…)")
  .max(500)
  .optional()
  .or(z.literal(""));

/**
 * Plattformen mit verbundenem Account — nur dort kann die App selbst posten.
 * Ohne Verbindung wäre ein „Jetzt posten" eine Lüge: der Worker fiele sofort
 * auf „Du bist dran" zurück, hätte aber den geplanten Termin schon überschrieben.
 */
async function connectedPlatforms(): Promise<Set<string>> {
  const accounts = await db
    .select({ platform: socialAccounts.platform, status: socialAccounts.status })
    .from(socialAccounts)
    .where(eq(socialAccounts.status, "connected"));
  return new Set(accounts.map((account) => account.platform));
}

/**
 * Einen Post SOFORT veröffentlichen lassen: Zeit auf jetzt, Publish-Job einreihen.
 * Nur mit verbundenem Account — sonst bleibt der Termin unangetastet und David
 * bekommt gesagt, dass er selbst posten muss.
 */
export async function pushNowAction(formData: FormData): Promise<void> {
  await requireSession();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return;

  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post || !nochNirgends(post)) {
    redirect("/posts?error=" + encodeURIComponent("Dieser Post ist schon draußen"));
  }

  const connected = await connectedPlatforms();
  if (!connected.has(post!.platform)) {
    redirect("/posts?manual=1");
  }

  await db
    .update(posts)
    .set({ scheduledAt: new Date(), status: "scheduled", error: null, updatedAt: new Date() })
    .where(eq(posts.id, postId));
  // manual: true — dieser Klick ist eine bewusste Handlung und läuft auch,
  // wenn das automatische Posten ausgeschaltet ist.
  await publishQueue().add(
    "publish",
    { postId, manual: true },
    { jobId: `publish-now-${postId}-${Date.now()}` }
  );

  revalidatePath("/posts");
  redirect("/posts?pushed=1");
}

/** Alle offenen Posts eines Videos auf einmal veröffentlichen lassen. */
export async function pushClipNowAction(formData: FormData): Promise<void> {
  await requireSession();
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return;

  const connected = await connectedPlatforms();
  const pending = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      status: posts.status,
      externalPostId: posts.externalPostId,
    })
    .from(posts)
    .where(and(eq(posts.clipId, clipId), inArray(posts.status, [...PENDING_STATES])));
  const pushable = pending
    .filter(nochNirgends)
    .filter((post) => connected.has(post.platform));

  if (pushable.length === 0) {
    redirect("/posts?manual=1");
  }

  const now = new Date();
  for (const post of pushable) {
    await db
      .update(posts)
      .set({ scheduledAt: now, status: "scheduled", error: null, updatedAt: now })
      .where(eq(posts.id, post.id));
    await publishQueue().add(
      "publish",
      { postId: post.id, manual: true },
      { jobId: `publish-now-${post.id}-${Date.now()}` }
    );
  }

  revalidatePath("/posts");
  redirect("/posts?pushed=" + pushable.length);
}

/**
 * Zeitplan neu aufbauen: alle noch nicht veröffentlichten Posts löschen,
 * betroffene Clips zurück auf „rendered" — der Worker plant sie mit der
 * Ein-Video-ein-Zeitpunkt-Logik frisch ein. Live-Posts bleiben unberührt.
 */
export async function rebuildScheduleAction(): Promise<void> {
  await requireSession();

  // Posts mit Plattform-ID bleiben stehen: Ein privat hochgeladenes
  // YouTube-Video würde sonst samt Studio-Link gelöscht und danach ein
  // zweites Mal hochgeladen.
  const pending = (
    await db
      .select({
        id: posts.id,
        clipId: posts.clipId,
        status: posts.status,
        externalPostId: posts.externalPostId,
      })
      .from(posts)
      .where(inArray(posts.status, [...PENDING_STATES]))
  ).filter(nochNirgends);
  const clipIds = [...new Set(pending.map((post) => post.clipId))];

  if (pending.length > 0) {
    await db.delete(posts).where(inArray(posts.id, pending.map((post) => post.id)));
  }
  if (clipIds.length > 0) {
    await db
      .update(clips)
      .set({ status: "rendered", updatedAt: new Date() })
      .where(and(inArray(clips.id, clipIds), eq(clips.status, "scheduled")));
    for (const clipId of clipIds) {
      await maintenanceQueue().add(
        "schedule",
        { clipId },
        { jobId: `schedule-rebuild-${clipId}-${Date.now()}` }
      );
    }
  }

  revalidatePath("/posts");
  redirect("/posts?rebuilt=" + clipIds.length);
}

/** Manual-Fallback abschließen: Post wurde von Hand veröffentlicht. */
export async function markPublishedAction(formData: FormData): Promise<void> {
  await requireSession();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return;

  const parsedUrl = urlSchema.safeParse(formData.get("externalUrl") ?? "");
  if (!parsedUrl.success) {
    redirect(
      `/posts?error=${encodeURIComponent(parsedUrl.error.issues[0]?.message ?? "URL ungültig")}`
    );
  }

  await db
    .update(posts)
    .set({
      status: "published",
      postedAt: new Date(),
      externalUrl: parsedUrl.data || null,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));

  revalidatePath("/posts");
  redirect("/posts?done=1");
}
