"use server";

import { db, posts, settings } from "@creatorhq/db";
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { analyticsQueue, commentsQueue, maintenanceQueue } from "@/lib/queues";
import { nachziehPlan } from "@/lib/system";

// Handbetrieb für Jan: Läufe anstoßen, ohne in den Container zu steigen.

/**
 * Hauptschalter fürs automatische Posten.
 *
 * Der gewünschte Zielzustand kommt aus dem Formular, nicht aus einem
 * „umdrehen" — sonst schaltet ein doppelt abgeschickter Klick oder ein
 * veralteter Tab die Automatik unbeabsichtigt wieder an.
 */
export async function setAutoPublishAction(formData: FormData): Promise<void> {
  await requireSession();
  const an = formData.get("an") === "1";

  await db
    .insert(settings)
    .values({ id: "default", autoPublish: an, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.id,
      set: { autoPublish: an, updatedAt: new Date() },
    });

  revalidatePath("/system");
  revalidatePath("/posts");
  redirect(`/system?automatik=${an ? "an" : "aus"}`);
}

/**
 * Wartende Posts über die kommenden Tage verteilen.
 *
 * Ohne das wäre das Anschalten der Automatik ein Ausbruch: Alle wartenden
 * Posts sind überfällig, der Minuten-Takt übergäbe sie binnen Minuten
 * gleichzeitig, und YouTubes Tageskontingent reicht für gut sechs Uploads.
 * Der Plan verteilt entlang der eingestellten Slots und Tageskappen — die
 * Vorschau auf /system zeigt vor dem Klick, was passieren wird.
 */
export async function nachziehenAction(): Promise<void> {
  await requireSession();
  const { plan } = await nachziehPlan();

  if (plan.zuweisungen.length === 0) {
    redirect("/system?error=" + encodeURIComponent("Nichts zu verteilen"));
  }

  for (const zuweisung of plan.zuweisungen) {
    await db
      .update(posts)
      .set({
        status: "scheduled",
        scheduledAt: zuweisung.zeitpunkt,
        error: null,
        attemptCount: 0,
        updatedAt: new Date(),
      })
      .where(inArray(posts.id, zuweisung.postIds));
  }

  revalidatePath("/system");
  revalidatePath("/posts");
  revalidatePath("/");
  redirect(`/system?verteilt=${plan.zuweisungen.length}`);
}

export async function runAnalyticsAction(): Promise<void> {
  await requireSession();
  await analyticsQueue().add("daily-analytics", {}, { jobId: `manual-analytics-${Date.now()}` });
  revalidatePath("/system");
  redirect("/system?gestartet=Messung");
}

export async function syncCommentsAction(): Promise<void> {
  await requireSession();
  await commentsQueue().add("sync-comments", {}, { jobId: `manual-comments-${Date.now()}` });
  revalidatePath("/system");
  redirect("/system?gestartet=Kommentar-Abgleich");
}

export async function runBackupAction(): Promise<void> {
  await requireSession();
  await maintenanceQueue().add("backup-daily", {}, { jobId: `manual-backup-${Date.now()}` });
  revalidatePath("/system");
  redirect("/system?gestartet=Sicherung");
}
