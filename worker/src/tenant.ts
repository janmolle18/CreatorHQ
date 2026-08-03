import type { Job } from "bullmq";
import { aktiveMandanten, withTenantSession, type DB } from "@creatorhq/db";
import { logger } from "./logger.ts";

// Mandantengrenze im Worker.
//
// Der Worker läuft nicht global über die Tabellen, sondern schleift über die
// aktiven Mandanten und arbeitet jeden einzeln in seiner eigenen Grenze ab.
// Das ist nicht nur wegen der Datenbankregeln so — es macht die Reihenfolge
// fair: Ein Creator mit fünfzig wartenden Videos kann keinen anderen
// aushungern.

/**
 * Höchstzahl an Einheiten, die ein Mandant je Durchgang einreihen darf.
 *
 * Die Sweeps laufen alle 15–30 Sekunden und sind selbstheilend — was jetzt
 * nicht drankommt, kommt beim nächsten Durchgang dran. Ohne diese Grenze
 * schöbe ein Mandant mit fünfzig freigegebenen Clips in einem Zug fünfzig
 * Render-Aufträge in die Schlange, und der nächste Creator wartet Stunden
 * hinter Arbeit, die nicht seine ist.
 */
export const MAX_JE_MANDANT_PRO_DURCHGANG = 5;

/**
 * Führt eine Aufgabe für jeden aktiven Mandanten aus — nacheinander, jeder in
 * seiner eigenen Grenze.
 *
 * Ein Fehler bei einem Mandanten darf die anderen nicht mitreißen: Sonst
 * würde ein einziges kaputtes Konto den Takt für alle Kunden anhalten.
 */
export async function jeMandant(
  aufgabe: string,
  arbeit: (db: DB, tenantId: string) => Promise<void>
): Promise<void> {
  const mandanten = await aktiveMandanten();
  for (const tenantId of mandanten) {
    try {
      await withTenantSession(tenantId, (db) => arbeit(db, tenantId));
    } catch (error) {
      const nachricht = error instanceof Error ? error.message : String(error);
      logger.error({ aufgabe, tenantId, err: nachricht }, "Mandant übersprungen");
    }
  }
}

/**
 * Holt den Mandanten aus dem Auftrag — und bricht laut ab, wenn er fehlt.
 *
 * Bewusst ein Fehler und kein stilles Weiterlaufen: Ohne gesetzten Mandanten
 * liefern die Abfragen unter der Datenbankregel null Zeilen. Der Auftrag
 * würde also erfolgreich melden, ohne irgendetwas getan zu haben — der
 * unangenehmste aller Fehler, weil er nirgends auftaucht.
 */
export function mandantAusAuftrag(job: Job<{ tenantId?: string }>): string {
  const tenantId = job.data?.tenantId;
  if (!tenantId) {
    throw new Error(
      `Auftrag "${job.name}" (${job.id}) kam ohne Mandanten an — abgelehnt, statt ins Leere zu laufen`
    );
  }
  return tenantId;
}

/** Führt einen Auftrag in der Grenze seines Mandanten aus. */
export async function imAuftragsMandanten<T>(
  job: Job<{ tenantId?: string }>,
  arbeit: (db: DB, tenantId: string) => Promise<T>
): Promise<T> {
  const tenantId = mandantAusAuftrag(job);
  // Ohne Transaktion: Ein Auftrag, der am Ende wirft, muss seinen Fehlerstatus
  // behalten dürfen — siehe withTenantSession.
  return withTenantSession(tenantId, (db) => arbeit(db, tenantId));
}
