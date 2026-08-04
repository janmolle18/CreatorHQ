import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Wächter über die Häfen der Nachbarschaft.
//
// CreatorHQ ist aus DavidHQ geforkt. Beide laufen auf demselben Mac, beide
// haben Postgres, Redis und MinIO — nur auf verschobenen Häfen. Die Fallwerte
// im Code zeigten nach dem Fork weiter auf DIE ALTEN: Wer `REDIS_URL` nicht
// setzt, landete stillschweigend in Davids Redis.
//
// Das ist kein Schönheitsfehler. `scripts/clear-queues.mjs` ruft
// `obliterate({ force: true })` auf jede Queue — mit dem alten Fallwert hätte
// ein Aufruf aus dem falschen Verzeichnis Davids Aufträge gelöscht, nicht die
// eigenen. Ein Fallwert, der auf ein FREMDES laufendes System zeigt, ist kein
// Komfort, sondern eine geladene Waffe.
//
// Deshalb: Davids Häfen dürfen im CreatorHQ-Quelltext nicht vorkommen.

const WURZEL = path.resolve(import.meta.dirname, "../..");

/** Was auf diesem Rechner zu DavidHQ gehört — Wert: was CreatorHQ nutzt. */
const FREMDE_HAEFEN = new Map<string, string>([
  ["5433", "Postgres — CreatorHQ liegt auf 5435"],
  ["6380", "Redis — CreatorHQ liegt auf 6381"],
  ["9002", "MinIO API — CreatorHQ liegt auf 9004"],
  ["9003", "MinIO Konsole — CreatorHQ liegt auf 9005"],
]);

/**
 * Nur `localhost:<hafen>` und `127.0.0.1:<hafen>` zählen.
 *
 * Eine nackte Zahl trifft zu viel: 5433 kann eine Zeitspanne in Millisekunden
 * sein, 9002 eine Auftragsnummer. Erst zusammen mit dem lokalen Rechnernamen
 * ist es eine Adresse — und nur die ist gefährlich.
 */
function fremdeAdressen(inhalt: string): string[] {
  const gefunden: string[] = [];
  for (const [hafen, wofuer] of FREMDE_HAEFEN) {
    const muster = new RegExp(`(?:localhost|127\\.0\\.0\\.1):${hafen}\\b`);
    if (muster.test(inhalt)) gefunden.push(`${hafen} (${wofuer})`);
  }
  return gefunden;
}

/**
 * Ausnahmen — und warum.
 *
 * Nur für Dateien, die den fremden Hafen ALS BEISPIEL nennen, nicht als Ziel.
 * Wer hier etwas einträgt, muss begründen, warum daraus keine Verbindung wird.
 */
const ERLAUBT = new Map<string, string>();

const ENDUNGEN = /\.(tsx?|mts|cts|mjs|cjs|js)$/;

// Diese Datei selbst nennt die fremden Häfen — sie muss es, sonst könnte sie
// nicht nach ihnen suchen.
const SELBST = path.relative(WURZEL, import.meta.filename);

function quellDateien(verzeichnis: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (["node_modules", ".next", ".git", "dist", "data", "tmp", "backups"].includes(eintrag)) {
      continue;
    }
    const voll = path.join(verzeichnis, eintrag);
    if (statSync(voll).isDirectory()) quellDateien(voll, gesammelt);
    else if (ENDUNGEN.test(eintrag)) gesammelt.push(voll);
  }
  return gesammelt;
}

describe("Häfen fremder Projekte", () => {
  const dateien = ["db", "shared", "web", "worker", "scripts"].flatMap((bereich) =>
    quellDateien(path.join(WURZEL, bereich))
  );

  it("findet überhaupt Quelldateien", () => {
    // Sicherung gegen einen Wächter, der wegen eines Pfadfehlers immer grün ist.
    expect(dateien.length).toBeGreaterThan(50);
  });

  it("kommen im Quelltext nicht vor", () => {
    const verstoesse = dateien
      .map((datei) => ({
        datei: path.relative(WURZEL, datei),
        treffer: fremdeAdressen(readFileSync(datei, "utf8")),
      }))
      .filter(
        ({ datei, treffer }) => treffer.length > 0 && datei !== SELBST && !ERLAUBT.has(datei)
      )
      .map(({ datei, treffer }) => `${datei}: ${treffer.join(", ")}`);

    expect(
      verstoesse,
      "Diese Dateien zeigen auf DavidHQs laufende Infrastruktur. Ein fehlendes " +
        "Env würde CreatorHQ dorthin verbinden — im schlimmsten Fall schreibend."
    ).toEqual([]);
  });

  it("erkennt eine fremde Adresse überhaupt", () => {
    // Ohne diesen Test wäre ein kaputtes Muster nicht von „alles sauber"
    // zu unterscheiden.
    expect(fremdeAdressen('url: "redis://localhost:6380"')).toHaveLength(1);
    expect(fremdeAdressen('url: "redis://localhost:6381"')).toHaveLength(0);
    expect(fremdeAdressen("const timeout = 5433;")).toHaveLength(0);
  });

  it("hat keine veralteten Einträge in der Positivliste", () => {
    const tot = [...ERLAUBT.keys()].filter((relativ) => {
      try {
        return fremdeAdressen(readFileSync(path.join(WURZEL, relativ), "utf8")).length === 0;
      } catch {
        return true; // Datei gibt es nicht mehr
      }
    });
    expect(tot, "Diese Ausnahmen sind überflüssig geworden").toEqual([]);
  });
});
