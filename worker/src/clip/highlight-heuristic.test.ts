import { describe, expect, test } from "vitest";
import { padWindow, selectHeuristicWindows } from "./highlight-heuristic.ts";
import type { Sentence } from "./sentences.ts";

interface SentenceSpec {
  dur: number;
  gap?: number;
  words?: number;
  text?: string;
}

function makeSentences(items: SentenceSpec[]): Sentence[] {
  const out: Sentence[] = [];
  let t = 0;
  for (const item of items) {
    const start = t;
    const end = start + item.dur;
    const gap = item.gap ?? 0.2;
    t = end + gap;
    out.push({
      start,
      end,
      text: item.text ?? "Ein ganz normaler Satz.",
      wordCount: item.words ?? Math.max(2, Math.round(item.dur * 2.5)),
      gapAfter: gap,
    });
  }
  return out;
}

const OPTS = { minSeconds: 20, maxSeconds: 40, maxCandidates: 3 };

describe("selectHeuristicWindows", () => {
  test("Fenster liegen auf Satzgrenzen und in der Längenspanne", () => {
    const sentences = makeSentences(Array.from({ length: 12 }, () => ({ dur: 5 })));
    const windows = selectHeuristicWindows(sentences, OPTS);
    expect(windows.length).toBeGreaterThan(0);
    for (const win of windows) {
      expect(win.start).toBe(sentences[win.startIndex]!.start);
      expect(win.end).toBe(sentences[win.endIndex]!.end);
      const duration = win.end - win.start;
      expect(duration).toBeGreaterThanOrEqual(OPTS.minSeconds);
      expect(duration).toBeLessThanOrEqual(OPTS.maxSeconds);
    }
  });

  test("bevorzugt ein Ende an einer Themen-Pause", () => {
    const sentences = makeSentences([
      { dur: 5 },
      { dur: 5 },
      { dur: 5 },
      { dur: 5 },
      { dur: 5 },
      { dur: 5, gap: 2.5 }, // klarer Themenwechsel nach Satz 5
      { dur: 5 },
      { dur: 5 },
    ]);
    const [best] = selectHeuristicWindows(sentences, { ...OPTS, maxCandidates: 1 });
    // Ohne die Pause würde das Fenster bis zur Maximallänge (Index 7) laufen.
    expect(best!.endIndex).toBe(5);
  });

  test("Fragen-dichte Passagen schlagen monotone", () => {
    const monotone: SentenceSpec[] = Array.from({ length: 8 }, () => ({
      dur: 5,
      text: "Eine ruhige Aussage.",
    }));
    const engaging: SentenceSpec[] = Array.from({ length: 8 }, () => ({
      dur: 5,
      text: "Warum passiert das hier?",
    }));
    const sentences = makeSentences([...monotone, { dur: 5, gap: 3 }, ...engaging]);
    const [best] = selectHeuristicWindows(sentences, { ...OPTS, maxCandidates: 1 });
    expect(best).toBeDefined();
    expect(best!.start).toBeGreaterThanOrEqual(sentences[9]!.start);
  });

  test("gewählte Fenster überlappen höchstens minimal", () => {
    const sentences = makeSentences(Array.from({ length: 30 }, () => ({ dur: 5 })));
    const windows = selectHeuristicWindows(sentences, OPTS);
    expect(windows.length).toBeLessThanOrEqual(OPTS.maxCandidates);
    for (let a = 0; a < windows.length; a++) {
      for (let b = a + 1; b < windows.length; b++) {
        const overlap =
          Math.min(windows[a]!.end, windows[b]!.end) -
          Math.max(windows[a]!.start, windows[b]!.start);
        const shorter = Math.min(
          windows[a]!.end - windows[a]!.start,
          windows[b]!.end - windows[b]!.start
        );
        expect(Math.max(0, overlap) / shorter).toBeLessThanOrEqual(0.15);
      }
    }
  });

  test("zu wenig Material liefert keine Fenster", () => {
    const sentences = makeSentences([{ dur: 5 }, { dur: 5 }]);
    expect(selectHeuristicWindows(sentences, OPTS)).toEqual([]);
  });

  test("ein Monster-Satz über der Maximallänge wird übersprungen", () => {
    const sentences = makeSentences([{ dur: 120 }]);
    expect(selectHeuristicWindows(sentences, OPTS)).toEqual([]);
  });

  test("Scores liegen in 0..1 und sind absteigend sortiert", () => {
    const sentences = makeSentences(
      Array.from({ length: 20 }, (_, i) => ({ dur: 5, words: 8 + (i % 5) * 3 }))
    );
    const windows = selectHeuristicWindows(sentences, OPTS);
    for (const win of windows) {
      expect(win.score).toBeGreaterThanOrEqual(0);
      expect(win.score).toBeLessThanOrEqual(1);
    }
    const scores = windows.map((win) => win.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("padWindow", () => {
  test("polstert Start/Ende und klemmt an Videogrenzen", () => {
    const win = { start: 10, end: 40, startIndex: 0, endIndex: 3, score: 0.5 };
    const padded = padWindow(win, 300);
    expect(padded.start).toBeCloseTo(9.65, 2);
    expect(padded.end).toBeCloseTo(40.6, 2);

    const early = padWindow({ ...win, start: 0.1 }, 300);
    expect(early.start).toBe(0);

    const late = padWindow({ ...win, end: 299.8 }, 300);
    expect(late.end).toBe(300);
  });
});
