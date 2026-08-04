"use server";

import { db, memberships, tenants } from "@creatorhq/db";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, requirePlatformAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";

// Betreiber-Zentrale: Kanäle betreten und ihren Zustand setzen.
//
// JEDE Aktion hier prüft zuerst requirePlatformAdmin(). Server Actions sind
// eine öffentliche Schnittstelle — wer die Kennung eines Formulars kennt, kann
// sie ohne die Oberfläche aufrufen. Ein Schalter, der nur in der Ansicht
// versteckt ist, ist kein Schutz.

const kanalSchema = z.object({ tenantId: z.string().uuid() });

/**
 * Als Betreiber in einen fremden Kanal wechseln.
 *
 * Es entsteht KEINE Mitgliedschaft — die Sitzung zeigt nur auf einen anderen
 * Kanal, und getSession() lässt das ausschließlich für Betreiber zu. Damit
 * bleibt der Vorgang rückstandslos: Wer das Betreiber-Kennzeichen verliert,
 * verliert im selben Moment den Zugang, auch mit altem Keks.
 */
export async function betreteKanalAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdmin();

  const eingabe = kanalSchema.safeParse({ tenantId: formData.get("tenantId") ?? "" });
  if (!eingabe.success) redirect("/zentrale?error=" + encodeURIComponent("Unbekannter Kanal"));

  const [kanal] = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, eingabe.data!.tenantId))
    .limit(1);
  if (!kanal) redirect("/zentrale?error=" + encodeURIComponent("Diesen Kanal gibt es nicht"));

  // Nachvollziehbar machen: Wer in fremden Daten arbeitet, hinterlässt eine
  // Spur. Ohne die ließe sich später nicht beantworten, wer etwas veröffentlicht hat.
  logger.warn(
    { adminUserId: session.userId, adminEmail: session.email, kanal: kanal.name },
    "Betreiber betritt fremden Kanal"
  );

  await createSession(session.userId, kanal.id);
  redirect("/?betreten=" + encodeURIComponent(kanal.name));
}

/** Zurück in den eigenen Kanal — der Weg heraus aus einem fremden. */
export async function verlasseKanalAction(): Promise<void> {
  const session = await requirePlatformAdmin();

  const [eigener] = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, session.userId))
    .orderBy(asc(memberships.createdAt))
    .limit(1);

  // Ein Betreiber ohne eigenen Kanal wäre ausgesperrt, sobald er einen fremden
  // verlässt. Das Anlege-Skript legt deshalb immer einen mit an.
  if (!eigener) {
    redirect("/zentrale?error=" + encodeURIComponent("Du hast keinen eigenen Kanal"));
  }

  await createSession(session.userId, eigener.tenantId);
  redirect("/zentrale?verlassen=1");
}

const statusSchema = z.object({
  tenantId: z.string().uuid(),
  status: z.enum(["trial", "active", "suspended", "cancelled"]),
});

/**
 * Zustand eines Kanals von Hand setzen.
 *
 * Solange die Abrechnung nicht angebunden ist, ist das der EINZIGE Weg, einen
 * Kanal freizuschalten oder zu sperren. Sobald Stripe hängt, setzt der Webhook
 * denselben Wert — dieser Schalter bleibt als Notfallweg.
 */
export async function setzeKanalStatusAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdmin();

  const eingabe = statusSchema.safeParse({
    tenantId: formData.get("tenantId") ?? "",
    status: formData.get("status") ?? "",
  });
  if (!eingabe.success) redirect("/zentrale?error=" + encodeURIComponent("Ungültige Eingabe"));

  const { tenantId, status } = eingabe.data!;

  // Sich selbst aussperren geht nicht: Ein gekündigter eigener Kanal nähme
  // dem Betreiber den Weg zurück in die Zentrale.
  if (tenantId === session.tenantId && status === "cancelled") {
    redirect(
      "/zentrale?error=" + encodeURIComponent("Den Kanal, in dem du gerade bist, nicht kündigen")
    );
  }

  const [geaendert] = await db
    .update(tenants)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning({ name: tenants.name });

  if (!geaendert) redirect("/zentrale?error=" + encodeURIComponent("Diesen Kanal gibt es nicht"));

  logger.warn(
    { adminEmail: session.email, kanal: geaendert.name, status },
    "Betreiber ändert Kanal-Zustand"
  );

  revalidatePath("/zentrale");
  redirect(`/zentrale?gesetzt=${encodeURIComponent(geaendert.name)}`);
}
