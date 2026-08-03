import { describe, expect, test } from "vitest";
import { parseBriefingJson } from "./briefing-schema";

const VALID = {
  summaryMd: "Die Woche lief solide: Kommentare fragen nach College-Content.",
  contentIdeas: [
    { title: "College-Tour Teil 2", description: "Follow-up zum meistkommentierten Video." },
  ],
  replyCandidates: [
    { commentId: "abc123", whyWorthIt: "Konkrete Frage", replySketch: "Kurz erklären, dann CTA." },
  ],
  brandRecommendations: [
    { area: "Frequenz", finding: "Nur 4 Videos", action: "2 Clips pro Woche posten." },
  ],
};

describe("parseBriefingJson", () => {
  test("valides Briefing wird geparst", () => {
    const result = parseBriefingJson(JSON.stringify(VALID));

    expect(result?.contentIdeas).toHaveLength(1);
    expect(result?.replyCandidates[0]?.commentId).toBe("abc123");
  });

  test("toleriert Text um das JSON", () => {
    const raw = `Hier dein Briefing:\n${JSON.stringify(VALID)}\nViel Erfolg!`;

    expect(parseBriefingJson(raw)?.summaryMd).toContain("College");
  });

  test("lehnt fehlende Pflicht-Sektionen ab", () => {
    expect(parseBriefingJson(JSON.stringify({ ...VALID, contentIdeas: [] }))).toBeNull();
    expect(
      parseBriefingJson(JSON.stringify({ ...VALID, brandRecommendations: undefined }))
    ).toBeNull();
    expect(parseBriefingJson(JSON.stringify({ ...VALID, summaryMd: "kurz" }))).toBeNull();
  });

  test("lehnt Nicht-JSON ab", () => {
    expect(parseBriefingJson("kein json weit und breit")).toBeNull();
  });

  test("kappt nicht: zu viele Ideen sind ein Schema-Fehler", () => {
    const tooMany = { ...VALID, contentIdeas: Array(9).fill(VALID.contentIdeas[0]) };

    expect(parseBriefingJson(JSON.stringify(tooMany))).toBeNull();
  });
});

describe("parseBriefingJson: Selbstkorrektur des Modells", () => {
  test("nimmt die letzte gültige Fassung, wenn Claude sich korrigiert", () => {
    const kaputt = '{"summaryMd":"zu kurz","contentIdeas":[]}';
    const raw =
      `${kaputt}\n\nIch muss das JSON vollständig liefern, hier die bereinigte Fassung:\n\n` +
      JSON.stringify(VALID);

    const result = parseBriefingJson(raw);
    expect(result?.summaryMd).toBe(VALID.summaryMd);
  });

  test("geschweifte Klammern im Text kippen die Erkennung nicht", () => {
    const raw = `Hinweis: benutze {} als Platzhalter.\n${JSON.stringify(VALID)}`;
    expect(parseBriefingJson(raw)?.summaryMd).toBe(VALID.summaryMd);
  });

  test("Klammern innerhalb von Zeichenketten zählen nicht mit", () => {
    const mitKlammer = {
      ...VALID,
      summaryMd: "Ein Lagebild mit } geschweifter Klammer im Fließtext, ausreichend lang.",
    };
    expect(parseBriefingJson(JSON.stringify(mitKlammer))?.summaryMd).toBe(mitKlammer.summaryMd);
  });

  test("ohne gültiges Objekt bleibt es bei null", () => {
    expect(parseBriefingJson("Ich kann das gerade nicht beantworten.")).toBeNull();
  });
});

describe("parseBriefingJson: Anführungszeichen im Fließtext", () => {
  test("ein einzelnes Anführungszeichen vor dem JSON verschluckt es nicht", () => {
    const raw = `Davids "bestes Video lief gut. Hier das Ergebnis:\n${JSON.stringify(VALID)}`;
    expect(parseBriefingJson(raw)?.summaryMd).toBe(VALID.summaryMd);
  });

  test("Apostroph und Zoll-Zeichen im Vortext stören nicht", () => {
    const raw = `Er sagte: "Läuft" und das 9" Format zieht.\n\n${JSON.stringify(VALID)}`;
    expect(parseBriefingJson(raw)?.summaryMd).toBe(VALID.summaryMd);
  });
});
