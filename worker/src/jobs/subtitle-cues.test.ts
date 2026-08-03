import { describe, expect, test } from "vitest";
import {
  buildClipSrt,
  cuesToSrt,
  sliceTranscriptWords,
  windowCues,
  wordsToCues,
} from "./subtitle-cues.ts";
import type { TranscriptSegment, TranscriptWord } from "@creatorhq/db";

const w = (start: number, end: number, word: string): TranscriptWord => ({ start, end, word });

const seg = (
  start: number,
  end: number,
  text: string,
  words: TranscriptWord[] = []
): TranscriptSegment => ({ start, end, text, words });

describe("wordsToCues", () => {
  test("bricht am Satzende um", () => {
    const cues = wordsToCues([
      w(0.0, 0.3, "Das"),
      w(0.35, 0.6, "ist"),
      w(0.65, 1.0, "gut."),
      w(1.1, 1.4, "Weiter"),
      w(1.45, 1.9, "geht's."),
    ]);
    expect(cues.map((c) => c.text)).toEqual(["Das ist gut.", "Weiter geht's."]);
  });

  test("begrenzt Cues auf maximal 5 Wörter", () => {
    const words = Array.from({ length: 8 }, (_, i) =>
      w(i * 0.4, i * 0.4 + 0.3, `Wort${i + 1}`)
    );
    const cues = wordsToCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text.split(" ")).toHaveLength(5);
    expect(cues[1]!.text.split(" ")).toHaveLength(3);
  });

  test("begrenzt Cues auf maximale Zeichenzahl", () => {
    const cues = wordsToCues([
      w(0.0, 0.5, "Kameraeinstellungen"),
      w(0.6, 1.1, "Belichtungszeit"),
      w(1.2, 1.7, "Blende"),
    ]);
    // 19 + 15 Zeichen > 30 → Umbruch nach dem ersten Wort
    expect(cues[0]!.text).toBe("Kameraeinstellungen");
    expect(cues[1]!.text).toBe("Belichtungszeit Blende");
  });

  test("lange Pause trennt und der Cue endet am Wort, nicht an der Stille", () => {
    const cues = wordsToCues([
      w(0.0, 0.3, "Na"),
      w(0.35, 0.6, "gut"),
      w(5.0, 5.4, "Weiter"),
    ]);
    expect(cues).toHaveLength(2);
    // Ende = letztes Wort + Nachlauf (0.15), NICHT bis 5.0 gestreckt
    expect(cues[0]!.end).toBeCloseTo(0.75, 2);
    expect(cues[1]!.start).toBeCloseTo(5.0, 2);
  });

  test("kleine Lücken werden geschlossen (kein Flackern)", () => {
    const cues = wordsToCues([w(0.0, 0.5, "Hi."), w(0.62, 1.3, "Ja.")]);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.end).toBe(cues[1]!.start);
  });

  test("sehr kurze Cues werden auf Mindestdauer verlängert", () => {
    const cues = wordsToCues([w(1.0, 1.1, "Ja.")]);
    expect(cues[0]!.end - cues[0]!.start).toBeGreaterThanOrEqual(0.6);
  });

  test("Mindestdauer läuft nie in den nächsten Cue hinein", () => {
    const cues = wordsToCues([w(1.0, 1.1, "Ja."), w(1.3, 2.5, "Gut.")]);
    expect(cues[0]!.end).toBeLessThanOrEqual(1.3);
  });

  test("Komma bricht weich um, wenn schon genug Wörter im Cue sind", () => {
    const cues = wordsToCues([
      w(0.0, 0.3, "Eins"),
      w(0.35, 0.6, "zwei"),
      w(0.65, 1.0, "drei,"),
      w(1.05, 1.4, "vier"),
      w(1.45, 1.9, "fünf."),
    ]);
    expect(cues.map((c) => c.text)).toEqual(["Eins zwei drei,", "vier fünf."]);
  });

  test("normalisiert Whisper-Leerzeichen in Wörtern", () => {
    const cues = wordsToCues([w(0.0, 0.4, " Hallo"), w(0.5, 0.9, " Welt.")]);
    expect(cues[0]!.text).toBe("Hallo Welt.");
  });
});

describe("cuesToSrt", () => {
  test("formatiert Standard-SRT mit Millisekunden", () => {
    const srt = cuesToSrt([
      { start: 0, end: 1.234, text: "Hallo" },
      { start: 1.234, end: 2.5, text: "Welt" },
    ]);
    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:01,234\nHallo\n\n2\n00:00:01,234 --> 00:00:02,500\nWelt\n"
    );
  });

  test("überspringt leere und rückwärts laufende Cues", () => {
    const srt = cuesToSrt([
      { start: 0, end: 1, text: "  " },
      { start: 2, end: 2, text: "Nix" },
      { start: 3, end: 4, text: "Ok" },
    ]);
    expect(srt).toContain("Ok");
    expect(srt).not.toContain("Nix");
    expect(srt.startsWith("1\n00:00:03,000")).toBe(true);
  });
});

describe("sliceTranscriptWords", () => {
  const segments = [
    seg(10, 20, "Erster Teil.", [w(10.0, 10.5, "Erster"), w(10.6, 11.0, "Teil.")]),
    seg(29.5, 40, "Mitte hier.", [w(29.9, 30.1, "Mitte"), w(30.2, 31.0, "hier.")]),
    seg(60, 70, "Ende.", [w(65.0, 65.5, "Ende.")]),
  ];

  test("nimmt nur Wörter im Fenster und rebasiert auf Clip-Zeit", () => {
    const words = sliceTranscriptWords(segments, 30, 60);
    expect(words.map((x) => x.word)).toEqual(["Mitte", "hier."]);
    // 29.9 - 30 = -0.1 → auf 0 geklemmt
    expect(words[0]!.start).toBe(0);
    expect(words[1]!.start).toBeCloseTo(0.2, 2);
  });

  test("leeres Fenster liefert leere Liste", () => {
    expect(sliceTranscriptWords(segments, 45, 55)).toEqual([]);
  });
});

describe("windowCues", () => {
  test("Segmente ohne Wort-Timestamps bleiben als Block-Cue erhalten", () => {
    const cues = windowCues(
      [
        seg(30, 32, "Hallo Welt.", [w(30.0, 30.4, "Hallo"), w(30.5, 31.0, "Welt.")]),
        seg(32, 35, "Lauter Zwischenteil.", []),
        seg(35, 37, "Und Schluss.", [w(35.2, 35.6, "Und"), w(35.7, 36.4, "Schluss.")]),
      ],
      30,
      60
    );
    expect(cues.map((c) => c.text)).toEqual([
      "Hallo Welt.",
      "Lauter Zwischenteil.",
      "Und Schluss.",
    ]);
    // Block-Cue rebasiert: 32-30 = 2
    expect(cues[1]!.start).toBe(2);
    expect(cues[1]!.end).toBe(5);
  });

  test("Cue-Enden werden an die Fensterlänge geklemmt", () => {
    const cues = windowCues(
      [seg(0, 12, "Randwort", [w(9.6, 10.4, "Randwort")])],
      0,
      10
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]!.end).toBeLessThanOrEqual(10);
  });
});

describe("buildClipSrt", () => {
  test("nutzt Wort-Timestamps, wenn vorhanden", () => {
    const srt = buildClipSrt([
      seg(0, 2, "Hallo Welt.", [w(0.0, 0.4, "Hallo"), w(0.5, 0.9, "Welt.")]),
    ]);
    expect(srt).toContain("Hallo Welt.");
    expect(srt).toContain("00:00:00,000");
  });

  test("fällt ohne Wörter auf Segment-Cues zurück", () => {
    const srt = buildClipSrt([seg(0, 2, "Hallo Welt.", []), seg(2, 4, "Noch mehr.", [])]);
    expect(srt).toContain("Hallo Welt.");
    expect(srt).toContain("Noch mehr.");
    expect(srt).toContain("00:00:02,000");
  });
});
