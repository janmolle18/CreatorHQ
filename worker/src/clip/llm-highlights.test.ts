import { describe, expect, test } from "vitest";
import { buildTranscriptPrompt, parseHighlightJson, picksToWindows } from "./llm-highlights.ts";
import type { Sentence } from "./sentences.ts";

function makeSentences(count: number, durSeconds = 5, gap = 0.2): Sentence[] {
  const out: Sentence[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    out.push({
      start: t,
      end: t + durSeconds,
      text: `Satz ${i}.`,
      wordCount: 8,
      gapAfter: gap,
    });
    t += durSeconds + gap;
  }
  return out;
}

const OPTS = { minSeconds: 20, maxSeconds: 40, maxCandidates: 4 };

describe("parseHighlightJson", () => {
  test("parst JSON auch mit Text drumherum", () => {
    const picks = parseHighlightJson(
      'Hier die Auswahl:\n{"clips":[{"start_index":2,"end_index":6,"hook":"Der Moment kippt","score":0.8}]}'
    );
    expect(picks).toEqual([
      { startIndex: 2, endIndex: 6, hook: "Der Moment kippt", score: 0.8 },
    ]);
  });

  test("liefert null bei kaputtem oder schema-fremdem JSON", () => {
    expect(parseHighlightJson("kein json")).toBeNull();
    expect(parseHighlightJson('{"clips":[]}')).toBeNull();
    expect(parseHighlightJson('{"clips":[{"start_index":-1,"end_index":2,"hook":"x","score":0.5}]}')).toBeNull();
  });
});

describe("picksToWindows", () => {
  test("mappt Indizes auf Satz-Zeiten", () => {
    const sentences = makeSentences(12);
    const [win] = picksToWindows(
      [{ startIndex: 1, endIndex: 5, hook: "Hook", score: 0.9 }],
      sentences,
      OPTS
    );
    expect(win!.start).toBe(sentences[1]!.start);
    expect(win!.end).toBe(sentences[5]!.end);
    expect(win!.hook).toBe("Hook");
  });

  test("erweitert zu kurze Fenster nach hinten bis zur Mindestlänge", () => {
    const sentences = makeSentences(12);
    const [win] = picksToWindows(
      [{ startIndex: 2, endIndex: 3, hook: "Kurz", score: 0.5 }],
      sentences,
      OPTS
    );
    expect(win).toBeDefined();
    expect(win!.end - win!.start).toBeGreaterThanOrEqual(OPTS.minSeconds);
    expect(win!.startIndex).toBe(2);
  });

  test("kürzt zu lange Fenster auf die Maximallänge", () => {
    const sentences = makeSentences(20);
    const [win] = picksToWindows(
      [{ startIndex: 0, endIndex: 19, hook: "Lang", score: 0.5 }],
      sentences,
      OPTS
    );
    expect(win).toBeDefined();
    expect(win!.end - win!.start).toBeLessThanOrEqual(OPTS.maxSeconds);
  });

  test("verwirft Fenster, die nie in die Spanne passen, und klemmt Indizes", () => {
    const sentences = makeSentences(2); // insgesamt ~10 s < min 20 s
    const windows = picksToWindows(
      [{ startIndex: 0, endIndex: 99, hook: "x", score: 0.5 }],
      sentences,
      OPTS
    );
    expect(windows).toEqual([]);
  });

  test("stark überlappende Picks werden auf den besten reduziert", () => {
    const sentences = makeSentences(12);
    const windows = picksToWindows(
      [
        { startIndex: 0, endIndex: 4, hook: "A", score: 0.6 },
        { startIndex: 0, endIndex: 5, hook: "B", score: 0.9 },
      ],
      sentences,
      OPTS
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]!.hook).toBe("B");
  });

  test("vertauschte Indizes werden repariert", () => {
    const sentences = makeSentences(12);
    const [win] = picksToWindows(
      [{ startIndex: 6, endIndex: 1, hook: "Gedreht", score: 0.5 }],
      sentences,
      OPTS
    );
    expect(win).toBeDefined();
    expect(win!.startIndex).toBe(1);
  });
});

describe("buildTranscriptPrompt", () => {
  test("nummeriert Sätze mit Startzeit", () => {
    const prompt = buildTranscriptPrompt(makeSentences(3, 65), "Mein Video");
    expect(prompt).toContain("Videotitel: Mein Video");
    expect(prompt).toContain("[0] (0:00) Satz 0.");
    expect(prompt).toContain("[1] (1:05) Satz 1.");
  });
});
