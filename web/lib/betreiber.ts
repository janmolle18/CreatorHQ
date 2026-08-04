// Betreiberangaben für Impressum, Datenschutz und AGB.
//
// Bewusst aus der Konfiguration und nicht im Code: Diese Angaben sind
// rechtlich verbindlich und personenbezogen. Sie gehören nicht in ein
// öffentliches Repository, und sie sollen sich ändern lassen, ohne dass
// jemand eine Datei anfassen muss.
//
// Fehlt etwas, zeigen die Seiten das offen an, statt Platzhalter auszuliefern,
// die aussehen wie echte Angaben. Ein Impressum mit „Max Mustermann" ist
// schlimmer als eines, das sagt: hier fehlt noch was.

export interface Betreiber {
  name: string;
  strasse: string;
  ort: string;
  land: string;
  email: string;
  telefon: string | null;
  /** Umsatzsteuer-Identifikationsnummer, falls vorhanden. */
  ustId: string | null;
  /** Falls im Handelsregister: „Amtsgericht X, HRB 12345". */
  register: string | null;
}

function wert(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function betreiber(): Betreiber | null {
  const name = wert("BETREIBER_NAME");
  const strasse = wert("BETREIBER_STRASSE");
  const ort = wert("BETREIBER_ORT");
  const email = wert("BETREIBER_EMAIL");

  // Diese vier sind das Minimum eines Impressums nach § 5 DDG.
  if (!name || !strasse || !ort || !email) return null;

  return {
    name,
    strasse,
    ort,
    land: wert("BETREIBER_LAND") ?? "Deutschland",
    email,
    telefon: wert("BETREIBER_TELEFON"),
    ustId: wert("BETREIBER_UST_ID"),
    register: wert("BETREIBER_REGISTER"),
  };
}

/** Adresse für Support-Anfragen — fällt auf die Betreiberadresse zurück. */
export function supportAdresse(): string | null {
  return wert("SUPPORT_EMAIL") ?? wert("BETREIBER_EMAIL");
}
