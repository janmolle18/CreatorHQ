import { sql } from "drizzle-orm";
import { db, reservierteVerbindung, type DB } from "./client";

// Mandantengrenze — die wichtigste Sicherheitseigenschaft des Produkts.
//
// Jede Abfrage auf Mandantendaten läuft durch withTenant(). Die Funktion
// öffnet eine Transaktion und setzt darin `app.tenant_id`; genau diesen Wert
// lesen die RLS-Regeln in der Datenbank (siehe die rls-Migration).
//
// Das Zusammenspiel ist Absicht: Der Code filtert, weil die Anwendung sonst
// unnötig viel liest — die Datenbank filtert, weil ein vergessener Filter im
// Code sonst die Daten eines fremden Creators ausliefern würde. Mit RLS
// liefert derselbe Fehler stattdessen null Zeilen. Falsch, aber nicht
// gefährlich.

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transaktions-Handle mit gesetzter Mandanten-Kennung. */
export type TenantDB = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Führt `fn` mit gesetzter Mandantengrenze aus.
 *
 * `set_config(..., true)` gilt nur für die laufende Transaktion — dadurch
 * kann die Einstellung nicht in der Verbindung zurückbleiben und beim nächsten
 * Griff aus dem Pool einen fremden Mandanten öffnen.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantDB) => Promise<T>
): Promise<T> {
  // Vor dem Einsetzen prüfen: Die RLS-Regel castet den Wert nach uuid, ein
  // krummer Wert würde dort als Datenbankfehler landen statt hier als klare
  // Meldung — und ein leerer Wert würde die Grenze stillschweigend öffnen.
  if (!UUID_MUSTER.test(tenantId)) {
    throw new Error(`Ungültige Mandanten-Kennung: ${JSON.stringify(tenantId)}`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Wie withTenant, aber OHNE Transaktion — für lang laufende Arbeit.
 *
 * Der Unterschied ist nicht kosmetisch. Ein Worker-Auftrag lädt herunter,
 * rendert und lädt hoch; das dauert Minuten. Läge das in einer Transaktion,
 * hätte das zwei Folgen, die beide beim ersten echten Lauf auffielen:
 *
 *   1. Ein Fehler am Ende rollt ALLES zurück — auch das `status: "failed"`,
 *      das den Fehler festhalten soll. Der Auftrag scheitert dann unsichtbar
 *      und der Datensatz sieht aus, als sei nie etwas passiert.
 *   2. Postgres hielte eine Transaktion minutenlang offen. Das blockiert das
 *      Aufräumen alter Zeilen und belegt die Verbindung ohne Not.
 *
 * Stattdessen: eine reservierte Verbindung, die Mandanten-Kennung auf
 * Sitzungsebene gesetzt (`set_config(..., false)`), und am Ende ausdrücklich
 * zurückgesetzt — sonst öffnete der nächste Griff aus dem Pool einen fremden
 * Mandanten.
 */
export async function withTenantSession<T>(
  tenantId: string,
  fn: (db: DB) => Promise<T>
): Promise<T> {
  if (!UUID_MUSTER.test(tenantId)) {
    throw new Error(`Ungültige Mandanten-Kennung: ${JSON.stringify(tenantId)}`);
  }
  const verbindung = await reservierteVerbindung();
  try {
    await verbindung.roh`select set_config('app.tenant_id', ${tenantId}, false)`;
    return await fn(verbindung.db);
  } finally {
    // Auch wenn die Arbeit geworfen hat: Die Verbindung darf die Kennung nicht
    // mit in den Pool zurücknehmen.
    await verbindung.roh`select set_config('app.tenant_id', '', false)`.catch(() => {});
    verbindung.freigeben();
  }
}

/**
 * Liest die Mandanten, für die überhaupt gearbeitet werden soll.
 *
 * Der Worker läuft nicht global über alle Tabellen, sondern schleift über
 * diese Liste und arbeitet jeden Mandanten einzeln in seiner eigenen Grenze
 * ab. Das ist nicht nur wegen RLS so: Es macht die Reihenfolge fair — ein
 * Creator mit fünfzig wartenden Videos kann keinen anderen aushungern.
 */
export async function aktiveMandanten(): Promise<string[]> {
  const zeilen = await db.execute<{ id: string }>(
    sql`select id from tenants where status in ('trial', 'active') order by created_at`
  );
  return [...zeilen].map((zeile) => zeile.id);
}
