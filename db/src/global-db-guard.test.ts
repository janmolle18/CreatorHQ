import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Wächter über das globale Datenbank-Handle.
//
// `db` aus @creatorhq/db kennt keinen Mandanten. Unter der Mandantenregel
// liefert es null Zeilen — die Tür fällt zu, nicht auf. Das ist die richtige
// Richtung, macht den Fehler aber unsichtbar: Die Funktion ist kaputt, sieht
// aber aus wie „nichts vorhanden".
//
// Genau so sind vier Fehler gleichzeitig entstanden: Der Publish-Pfad fand nie
// ein Token und meldete „Konto neu verbinden"; Video und Vorschaubild
// antworteten mit 404; die Clip-Auswahl fiel stillschweigend auf die
// Lautstärke-Heuristik zurück und lieferte schlechtere Clips.
//
// Dieser Test verhindert die ganze Klasse, statt Einzelfälle zu beheben.
// Wer `db` woanders braucht, trägt die Datei bewusst hier ein — mit Begründung.

const WURZEL = path.resolve(import.meta.dirname, "../..");

/**
 * Dateien, die das globale Handle benutzen dürfen — und warum.
 *
 * Gemeinsam ist ihnen: Sie arbeiten auf Tabellen OHNE Mandantenregel
 * (tenants, users, memberships) oder brauchen gar keine Zeilen. Genau dort
 * kann es keinen Mandanten geben, weil er erst festgestellt wird.
 */
// (db/src/* steht bewusst NICHT hier: Diese Dateien importieren nicht aus dem
// Paket, sie sind es — das Muster unten trifft sie gar nicht.)
const ERLAUBT = new Map<string, string>([
  ["web/lib/auth.ts", "schlägt Sitzung/Mitgliedschaft nach — davor gibt es keinen Mandanten"],
  ["web/app/login/actions.ts", "Anmeldung und Registrierung arbeiten auf users/tenants"],
  ["web/lib/slug.ts", "prüft Kurznamen gegen die Mandantentabelle selbst"],
  ["web/lib/infra.ts", "nur `select 1` als Lebenszeichen, liest keine Daten"],
]);

/** Erkennt `db` in der Import-Liste von @creatorhq/db — auch mehrzeilig. */
const IMPORT_MUSTER = /import\s*\{([^}]*)\}\s*from\s*["']@creatorhq\/db["']/gs;

function quellDateien(verzeichnis: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (["node_modules", ".next", ".git", "dist", "data", "tmp"].includes(eintrag)) continue;
    const voll = path.join(verzeichnis, eintrag);
    if (statSync(voll).isDirectory()) quellDateien(voll, gesammelt);
    else if (/\.tsx?$/.test(eintrag)) gesammelt.push(voll);
  }
  return gesammelt;
}

function nutztGlobalesHandle(inhalt: string): boolean {
  for (const treffer of inhalt.matchAll(IMPORT_MUSTER)) {
    const namen = treffer[1]!.split(",").map((teil) => teil.trim());
    // `type DB` ist nur der Typ, kein Handle — der ist überall erlaubt.
    if (namen.some((name) => name === "db")) return true;
  }
  return false;
}

describe("globales Datenbank-Handle", () => {
  const dateien = ["db", "shared", "web", "worker"].flatMap((bereich) =>
    quellDateien(path.join(WURZEL, bereich))
  );

  it("findet überhaupt Quelldateien", () => {
    // Sicherung gegen einen Wächter, der wegen eines Pfadfehlers immer grün ist.
    expect(dateien.length).toBeGreaterThan(50);
  });

  it("wird nur an ausdrücklich erlaubten Stellen benutzt", () => {
    const verstoesse = dateien
      .filter((datei) => nutztGlobalesHandle(readFileSync(datei, "utf8")))
      .map((datei) => path.relative(WURZEL, datei))
      .filter((relativ) => !ERLAUBT.has(relativ));

    expect(
      verstoesse,
      "Diese Dateien holen `db` direkt statt über withTenant/mitMandant/" +
        "imAuftragsMandanten. Unter der Mandantenregel liefern ihre Abfragen " +
        "null Zeilen — sie sind kaputt, sehen aber aus wie leer. Entweder " +
        "umstellen oder bewusst in ERLAUBT eintragen."
    ).toEqual([]);
  });

  it("hat keine veralteten Einträge in der Positivliste", () => {
    // Eine Ausnahme, die niemand mehr braucht, ist eine offene Tür für den
    // nächsten Fehler.
    const tot = [...ERLAUBT.keys()].filter((relativ) => {
      const voll = path.join(WURZEL, relativ);
      try {
        return !nutztGlobalesHandle(readFileSync(voll, "utf8"));
      } catch {
        return true; // Datei gibt es nicht mehr
      }
    });
    expect(tot, "Diese Ausnahmen sind überflüssig geworden").toEqual([]);
  });
});
