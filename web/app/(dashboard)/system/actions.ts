"use server";

import { posts, settings } from "@creatorhq/db";
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mitMandant, requireOwner, requireSession, requireDarfPosten } from "@/lib/auth";
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
  const an = formData.get("an") === "1";

  // Nur der Inhaber: Automatisches Posten im Namen des Creators ist keine
  // Entscheidung, die ein eingeladener Video-Editor treffen soll.
  await requireOwner();
  // Und nur, wenn der Kanal überhaupt senden darf. Ausschalten bleibt immer
  // erlaubt — einen Schalter, den man nur noch anlassen kann, will niemand.
  if (an) await requireDarfPosten();
  await mitMandant((tx, session) =>
    tx
      .insert(settings)
      .values({ tenantId: session.tenantId, creatorName: session.tenantName, autoPublish: an, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.tenantId,
        set: { autoPublish: an, updatedAt: new Date() },
      })
  );

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
  const session = await requireSession();
  const { plan } = await nachziehPlan(session.tenantId);

  if (plan.zuweisungen.length === 0) {
    redirect("/system?error=" + encodeURIComponent("Nichts zu verteilen"));
  }

  await mitMandant(async (tx) => {
    for (const zuweisung of plan.zuweisungen) {
      await tx
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
  });

  revalidatePath("/system");
  revalidatePath("/posts");
  revalidatePath("/");
  redirect(`/system?verteilt=${plan.zuweisungen.length}`);
}

export async function runAnalyticsAction(): Promise<void> {
  const session = await requireSession();
  await analyticsQueue().add(
    "daily-analytics",
    { tenantId: session.tenantId },
    { jobId: `manual-analytics-${session.tenantId}-${Date.now()}` }
  );
  revalidatePath("/system");
  redirect("/system?gestartet=Messung");
}

export async function syncCommentsAction(): Promise<void> {
  const session = await requireSession();
  await commentsQueue().add(
    "sync-comments",
    { tenantId: session.tenantId },
    { jobId: `manual-comments-${session.tenantId}-${Date.now()}` }
  );
  revalidatePath("/system");
  redirect("/system?gestartet=Kommentar-Abgleich");
}

/**
 * Sicherung der GESAMTEN Datenbank — plattformweit, nicht je Mandant.
 *
 * Deshalb nur für Jan: Ein Creator, der hier klickt, würde einen Dump mit den
 * Daten aller anderen Kunden erzeugen. Beim Einzelplatz-Vorgänger war das
 * dieselbe Person; hier nicht mehr.
 */
export async function runBackupAction(): Promise<void> {
  const session = await requireSession();
  if (!session.isPlatformAdmin) {
    redirect("/system?error=" + encodeURIComponent("Dafür fehlt dir die Berechtigung"));
  }
  await maintenanceQueue().add("backup-daily", {}, { jobId: `manual-backup-${Date.now()}` });
  revalidatePath("/system");
  redirect("/system?gestartet=Sicherung");
}
