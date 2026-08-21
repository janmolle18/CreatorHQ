import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  ACCOUNT_STATUS,
  BRIEFING_STATUS,
  CLIP_STATUS,
  IDEA_STATUS,
  POST_LIVE,
  POST_LOCKS_DELETE,
  POST_PENDING,
  POST_STATUS,
  SOURCE_STATUS,
  postUrgency,
  type StatusMeta,
} from "./status";

const ALLE_TABELLEN: Array<[string, Record<string, StatusMeta>]> = [
  ["POST_STATUS", POST_STATUS],
  ["CLIP_STATUS", CLIP_STATUS],
  ["SOURCE_STATUS", SOURCE_STATUS],
  ["ACCOUNT_STATUS", ACCOUNT_STATUS],
  ["BRIEFING_STATUS", BRIEFING_STATUS],
  ["IDEA_STATUS", IDEA_STATUS],
];

describe("Status-Registry", () => {
  test.each(ALLE_TABELLEN)("%s: jeder Zustand hat ein echtes Label", (_name, tabelle) => {
    for (const [wert, meta] of Object.entries(tabelle)) {
      expect(meta.label.trim().length, `${wert} ohne Label`).toBeGreaterThan(0);
      // Der rohe Datenbankwert darf nie in der Oberfläche landen.
      expect(meta.label).not.toBe(wert);
    }
  });

  test("erledigt ist grün, Creator-ist-dran gelb, kaputt rot", () => {
    expect(POST_STATUS.published.tone).toBe("ok");
    expect(POST_STATUS.awaiting_manual.tone).toBe("warn");
    // Übergeben ≠ veröffentlicht: TikTok-Inbox und privates YouTube-Video
    // brauchen noch einen Handgriff des Creators.
    expect(POST_STATUS.posted.tone).toBe("warn");
    expect(POST_STATUS.failed.tone).toBe("err");
  });

  test("Zustandsmengen überschneiden sich nicht widersprüchlich", () => {
    for (const status of POST_PENDING) {
      expect(POST_LIVE.has(status), `${status} kann nicht offen und live sein`).toBe(false);
    }
    // Löschsperre ist die Live-Menge plus laufender Upload.
    for (const status of POST_LIVE) expect(POST_LOCKS_DELETE.has(status)).toBe(true);
    expect(POST_LOCKS_DELETE.has("uploading")).toBe(true);
  });
});

describe("postUrgency", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  const todayEnd = new Date("2026-08-01T21:59:59Z");

  test("Vergangenes ist überfällig", () => {
    const post = { status: "awaiting_manual" as const, scheduledAt: new Date("2026-08-01T07:00:00Z") };
    expect(postUrgency(post, now, todayEnd)).toBe("overdue");
  });

  test("Späteres am selben Tag ist heute", () => {
    const post = { status: "scheduled" as const, scheduledAt: new Date("2026-08-01T18:00:00Z") };
    expect(postUrgency(post, now, todayEnd)).toBe("today");
  });

  test("Morgen ist später", () => {
    const post = { status: "scheduled" as const, scheduledAt: new Date("2026-08-02T07:00:00Z") };
    expect(postUrgency(post, now, todayEnd)).toBe("later");
  });

  test("Veröffentlichtes ist nie dringend", () => {
    const post = { status: "published" as const, scheduledAt: new Date("2026-07-01T07:00:00Z") };
    expect(postUrgency(post, now, todayEnd)).toBe("done");
  });

  test("ohne Termin bleibt es unaufgeregt", () => {
    const post = { status: "draft" as const, scheduledAt: null };
    expect(postUrgency(post, now, todayEnd)).toBe("later");
  });
});

// ── Wächter: die Registry bleibt die einzige Quelle ────────────────────────
//
// Zweimal ist dasselbe passiert: Eine Seite legte sich ihre eigene
// Statustabelle an, und die Wörter liefen auseinander. `posted` war einmal
// grün „Übergeben" und einmal gelb „Übergeben — du bist dran" — grün hieß
// damit „erledigt" für etwas, das noch einen Handgriff braucht. `published`
// hieß mal „Veröffentlicht", mal „Live". Fünf Seiten waren betroffen.
//
// Der Typ erzwingt Vollständigkeit, aber nicht Einzigartigkeit. Das hier schon.

describe("keine eigenen Statustabellen neben der Registry", () => {
  const SEITEN = path.join(import.meta.dirname, "..", "app");

  /** Namen, unter denen die Duplikate bisher aufgetaucht sind. */
  const VERDAECHTIG =
    /const\s+(STATUS_LABEL|POST_CHIP|CLIP_SUBSTATUS|[A-Z_]*STATUS_MAP)\s*[:=]/;

  function dateien(verzeichnis: string, gesammelt: string[] = []): string[] {
    for (const eintrag of readdirSync(verzeichnis)) {
      const voll = path.join(verzeichnis, eintrag);
      if (statSync(voll).isDirectory()) dateien(voll, gesammelt);
      else if (/\.tsx?$/.test(eintrag)) gesammelt.push(voll);
    }
    return gesammelt;
  }

  /**
   * Wörter, welche die Registry ersetzt hat.
   *
   * Der Tabellen-Wächter oben sieht nur `const STATUS_LABEL = {…}`. Genau
   * daran ist eine sechste Stelle vorbeigerutscht: In import/page.tsx stand
   * das Label als Ternär mitten im JSX (`clip.status === "failed" ? … :
   * "Publish-fertig"`). Deshalb zusätzlich die abgelösten Wörter selbst.
   */
  const ABGELOESTE_WOERTER = [
    "Publish-fertig",
    "Clipping läuft",
    "Wartet auf Render",
    "Lädt herunter",
    "Geclippt",
  ];

  test("abgeloeste Woerter kommen nicht mehr vor", () => {
    const treffer = dateien(SEITEN)
      .map((datei) => ({
        datei: path.relative(path.join(SEITEN, ".."), datei),
        // Nur Zeilen ohne Kommentarzeichen: Die Begründung, warum ein Wort
        // abgelöst wurde, darf es selbstverständlich nennen.
        worte: ABGELOESTE_WOERTER.filter((wort) =>
          readFileSync(datei, "utf8")
            .split("\n")
            .some((zeile) => zeile.includes(wort) && !zeile.trimStart().startsWith("//"))
        ),
      }))
      .filter(({ worte }) => worte.length > 0)
      .map(({ datei, worte }) => `${datei}: ${worte.join(", ")}`);

    expect(
      treffer,
      "Diese Wörter hat die Registry ersetzt. Nimm den Text aus " +
        "web/lib/status.ts, statt ihn erneut von Hand zu schreiben."
    ).toEqual([]);
  });

  test("keine Seite definiert ihre eigene", () => {
    const treffer = dateien(SEITEN)
      .filter((datei) => VERDAECHTIG.test(readFileSync(datei, "utf8")))
      .map((datei) => path.relative(path.join(SEITEN, ".."), datei));

    expect(
      treffer,
      "Diese Dateien legen sich eine eigene Statustabelle an. Nimm die Werte " +
        "aus web/lib/status.ts — sonst heißt dasselbe Wort an zwei Stellen " +
        "Verschiedenes."
    ).toEqual([]);
  });
});
