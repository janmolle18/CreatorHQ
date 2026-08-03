"use server";

import { briefings, comments, db, ideas } from "@creatorhq/db";
import { isPublishPlatform } from "@creatorhq/shared";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { briefingQueue } from "@/lib/queues";

/** Briefing sofort erstellen: Kommentar-Sync + Claude-Auswertung anstoßen. */
export async function runBriefingAction(): Promise<void> {
  await requireSession();
  await briefingQueue().add(
    "daily-briefing",
    {},
    { jobId: `manual-briefing-${Date.now()}` }
  );
  revalidatePath("/briefing");
  redirect("/briefing?started=1");
}

/** Video-Idee aus dem Briefing in den Ideen-Backlog übernehmen. */
export async function adoptContentIdeaAction(formData: FormData): Promise<void> {
  await requireSession();
  const briefingId = String(formData.get("briefingId") ?? "");
  const index = Number(formData.get("index"));
  if (!briefingId || !Number.isInteger(index)) return;

  const [briefing] = await db.select().from(briefings).where(eq(briefings.id, briefingId));
  const idea = briefing?.contentIdeas[index];
  if (!idea) redirect("/briefing?error=" + encodeURIComponent("Idee nicht gefunden"));

  await db.insert(ideas).values({
    title: idea.title,
    description: idea.description,
    status: "idea",
    source: "briefing",
    briefingId,
    targetPlatforms: (idea.targetPlatforms ?? []).filter(isPublishPlatform),
  });

  revalidatePath("/briefing");
  revalidatePath("/planning");
  redirect("/briefing?adopted=1");
}

/** Kommentar-Antwort-Kandidaten als Idee übernehmen (source=comment). */
export async function adoptReplyCandidateAction(formData: FormData): Promise<void> {
  await requireSession();
  const briefingId = String(formData.get("briefingId") ?? "");
  const index = Number(formData.get("index"));
  if (!briefingId || !Number.isInteger(index)) return;

  const [briefing] = await db.select().from(briefings).where(eq(briefings.id, briefingId));
  const candidate = briefing?.replyCandidates[index];
  if (!candidate) redirect("/briefing?error=" + encodeURIComponent("Kandidat nicht gefunden"));

  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.externalCommentId, candidate.commentId));

  await db.insert(ideas).values({
    title: `Antwort-Video: ${comment?.author ?? "Kommentar"}`,
    description: `Kommentar: „${comment?.text ?? candidate.commentId}“\n\nWarum: ${candidate.whyWorthIt}\n\nSkizze: ${candidate.replySketch}`,
    status: "idea",
    source: "comment",
    briefingId,
    commentId: comment?.id ?? null,
  });

  revalidatePath("/briefing");
  revalidatePath("/planning");
  redirect("/briefing?adopted=1");
}
