import { describe, expect, test } from "vitest";
import { segmentsToSentences } from "./sentences.ts";
import type { TranscriptSegment, TranscriptWord } from "@creatorhq/db";

const w = (start: number, end: number, word: string): TranscriptWord => ({ start, end, word });

const seg = (
  start: number,
  end: number,
  text: string,
  words: TranscriptWord[]
): TranscriptSegment => ({ start, end, text, words });

describe("segmentsToSentences", () => {
  test("Satzzeichen am Segmentende trennt Sätze", () => {
    const sentences = segmentsToSentences([
      seg(0, 1, "Das ist gut.", [w(0.0, 0.3, "Das"), w(0.35, 0.6, "ist"), w(0.65, 1.0, "gut.")]),
      seg(1.4, 2.4, "Und weiter.", [w(1.4, 1.6, "Und"), w(1.7, 2.4, "weiter.")]),
    ]);
    expect(sentences.map((s) => s.text)).toEqual(["Das ist gut.", "Und weiter."]);
    expect(sentences[0]!.start).toBe(0);
    expect(sentences[0]!.end).toBe(1.0);
    expect(sentences[0]!.wordCount).toBe(3);
  });

  test("Satzzeichen mitten im Segment trennt bei hörbarer Pause", () => {
    const sentences = segmentsToSentences([
      seg(0, 3, "Klar. Dann los.", [
        w(0.0, 0.5, "Klar."),
        w(0.9, 1.2, "Dann"),
        w(1.3, 1.8, "los."),
      ]),
    ]);
    expect(sentences.map((s) => s.text)).toEqual(["Klar.", "Dann los."]);
  });

  test("Abkürzungen ohne Pause trennen nicht (z. B.)", () => {
    const sentences = segmentsToSentences([
      seg(0, 2, "z. B. hier", [
        w(0.0, 0.2, "z."),
        w(0.25, 0.45, "B."),
        w(0.5, 0.9, "hier"),
      ]),
    ]);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]!.text).toBe("z. B. hier");
  });

  test("lange Pause trennt auch ohne Satzzeichen", () => {
    const sentences = segmentsToSentences([
      seg(0, 5, "Also gut dann eben", [
        w(0.0, 0.4, "Also"),
        w(0.5, 0.9, "gut"),
        w(2.5, 2.9, "dann"),
        w(3.0, 3.4, "eben"),
      ]),
    ]);
    expect(sentences.map((s) => s.text)).toEqual(["Also gut", "dann eben"]);
  });

  test("gapAfter misst die Pause zum Folgesatz", () => {
    const sentences = segmentsToSentences([
      seg(0, 1, "Eins.", [w(0.0, 1.0, "Eins.")]),
      seg(3.0, 4.0, "Zwei.", [w(3.0, 4.0, "Zwei.")]),
    ]);
    expect(sentences[0]!.gapAfter).toBeCloseTo(2.0, 2);
    expect(sentences[1]!.gapAfter).toBeGreaterThan(100); // letzter Satz: „unendliche" Pause
  });

  test("Segmente ohne Wort-Timestamps werden als eigene Sätze übernommen", () => {
    const sentences = segmentsToSentences([
      seg(0, 2, "Nur Segmenttext.", []),
      seg(2.5, 4, "Noch einer.", []),
    ]);
    expect(sentences.map((s) => s.text)).toEqual(["Nur Segmenttext.", "Noch einer."]);
    expect(sentences[0]!.wordCount).toBe(2);
  });

  test("wortloses Segment mitten im Transkript geht nicht verloren", () => {
    const sentences = segmentsToSentences([
      seg(0, 2, "Hallo Welt.", [w(0.0, 0.8, "Hallo"), w(0.9, 1.6, "Welt.")]),
      seg(2, 5, "Lauter Zwischenteil ohne Alignment.", []),
      seg(5, 7, "Und Schluss.", [w(5.2, 5.6, "Und"), w(5.7, 6.4, "Schluss.")]),
    ]);
    expect(sentences.map((s) => s.text)).toEqual([
      "Hallo Welt.",
      "Lauter Zwischenteil ohne Alignment.",
      "Und Schluss.",
    ]);
    expect(sentences[1]!.start).toBe(2);
    expect(sentences[1]!.wordCount).toBe(4);
  });

  test("leere Eingabe liefert leere Liste", () => {
    expect(segmentsToSentences([])).toEqual([]);
  });
});
