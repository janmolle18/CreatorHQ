"use server";

import { briefings, comments, db, ideas } from "@creatorhq/db";
import { isPublishPlatform } from "@creatorhq/shared";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mitMandant, requireSession } from "@/lib/auth";
import { briefingQueue } from "@/lib/queues";

/** Briefing sofort erstellen: Kommentar-Sync + Claude-Auswertung anstoßen. */
export async function runBriefingAction(): Promise<void> {
  const session = await requireSession();
  await briefingQueue().add(
    "daily-briefing",
    { tenantId: session.tenantId },
    // Mandant in der Auftrags-Kennung: Sonst verwirft BullMQ den Auftrag des
    // zweiten Creators, wenn zwei in derselben Millisekunde klicken.
    { jobId: `manual-briefing-${session.tenantId}-${Date.now()}` }
  );
  revalidatePath("/briefing");
  redirect("/briefing?started=1");
}

/** Video-Idee aus dem Briefing in den Ideen-Backlog übernehmen. */
export async function adoptContentIdeaAction(formData: FormData): Promise<void> {
  const briefingId = String(formData.get("briefingId") ?? "");
  const index = Number(formData.get("index"));
  if (!briefingId || !Number.isInteger(index)) return;

  // redirect() steht bewusst NACH dem Block: Innerhalb der Transaktion waere
  // die geworfene Umleitung ein Abbruch und wuerde das Einfuegen zuruecknehmen.
  const uebernommen = await mitMandant(async (tx, session) => {
    const [briefing] = await tx.select().from(briefings).where(eq(briefings.id, briefingId));
    const idea = briefing?.contentIdeas[index];
    if (!idea) return false;

    await tx.insert(ideas).values({
      tenantId: session.tenantId,
      title: idea.title,
      description: idea.description,
      status: "idea",
      source: "briefing",
      briefingId,
      targetPlatforms: (idea.targetPlatforms ?? []).filter(isPublishPlatform),
    });
    return true;
  });
  if (!uebernommen) redirect("/briefing?error=" + encodeURIComponent("Idee nicht gefunden"));

  revalidatePath("/briefing");
  revalidatePath("/planning");
  redirect("/briefing?adopted=1");
}

/** Kommentar-Antwort-Kandidaten als Idee übernehmen (source=comment). */
export async function adoptReplyCandidateAction(formData: FormData): Promise<void> {
  const briefingId = String(formData.get("briefingId") ?? "");
  const index = Number(formData.get("index"));
  if (!briefingId || !Number.isInteger(index)) return;

  const uebernommen = await mitMandant(async (tx, session) => {
    const [briefing] = await tx.select().from(briefings).where(eq(briefings.id, briefingId));
    const candidate = briefing?.replyCandidates[index];
    if (!candidate) return false;

    const [comment] = await tx
      .select()
      .from(comments)
      .where(eq(comments.externalCommentId, candidate.commentId));

    await tx.insert(ideas).values({
      tenantId: session.tenantId,
      title: `Antwort-Video: ${comment?.author ?? "Kommentar"}`,
      description: `Kommentar: „${comment?.text ?? candidate.commentId}“\n\nWarum: ${candidate.whyWorthIt}\n\nSkizze: ${candidate.replySketch}`,
      status: "idea",
      source: "comment",
      briefingId,
      commentId: comment?.id ?? null,
    });
    return true;
  });
  if (!uebernommen) {
    redirect("/briefing?error=" + encodeURIComponent("Kandidat nicht gefunden"));
  }

  revalidatePath("/briefing");
  revalidatePath("/planning");
  redirect("/briefing?adopted=1");
}
