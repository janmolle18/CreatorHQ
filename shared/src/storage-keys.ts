// Speicher-Ablage je Mandant.
//
// Alle Objekte liegen unter tenants/<mandant>/… — aus drei Gründen:
//   1. Kündigt ein Kunde, ist sein Speicher ein Präfix, kein Suchlauf.
//   2. Der Verbrauch je Mandant ist ablesbar, ohne die Datenbank zu fragen.
//   3. Die signierten Medien-URLs signieren den vollen Pfad (media-sign.ts) —
//      damit ist eine gültige Signatur automatisch an ihren Mandanten
//      gebunden und lässt sich nicht auf fremde Objekte umbiegen.
//
// Die Kennungen darunter sind UUIDs und wären auch ohne Präfix eindeutig;
// die Trennung dient der Zuordnung, nicht der Kollisionsvermeidung.

export type SpeicherBereich = "sources" | "clips" | "thumbs" | "imports";

/** Präfix eines Mandanten — ohne Bereich, für Verbrauch und Aufräumen. */
export function mandantenPraefix(tenantId: string): string {
  return `tenants/${tenantId}/`;
}

/** Präfix eines Bereichs innerhalb eines Mandanten. */
export function bereichsPraefix(tenantId: string, bereich: SpeicherBereich): string {
  return `${mandantenPraefix(tenantId)}${bereich}/`;
}

/** Vollständiger Objektschlüssel. */
export function speicherSchluessel(
  tenantId: string,
  bereich: SpeicherBereich,
  dateiname: string
): string {
  return `${bereichsPraefix(tenantId, bereich)}${dateiname}`;
}

/**
 * Liest den Mandanten aus einem Schlüssel — oder null bei Altbestand ohne
 * Präfix. Wird gebraucht, um beim Ausliefern einer Datei zu prüfen, dass sie
 * wirklich dem anfragenden Mandanten gehört.
 */
export function mandantAusSchluessel(schluessel: string): string | null {
  const treffer = /^tenants\/([0-9a-f-]{36})\//i.exec(schluessel);
  return treffer?.[1] ?? null;
}
