import type { Sentence } from "./sentences.ts";

// Keyless Highlight-Auswahl auf Satzbasis (Fallback ohne ANTHROPIC_API_KEY).
// Ersetzt die reine Lautstärke-Bewertung fester Fenster: Kandidaten sind
// immer satz-aligned, enden bevorzugt an Themen-Pausen und werden nach
// Sprechdichte + Engagement-Markern (Fragen/Ausrufe) bewertet.

export interface HighlightWindow {
  start: number;
  end: number;
  startIndex: number;
  endIndex: number;
  score: number;
}

export interface HighlightOptions {
  minSeconds: number;
  maxSeconds: number;
  maxCandidates: number;
}

/** Ein Fenster gilt als „sauber getrennt", wenn danach ≥ 1 s Pause folgt. */
const CLEAN_BREAK_GAP = 1.0;
/** Maximal erlaubte Überlappung zweier gewählter Fenster (Anteil am kürzeren). */
const MAX_OVERLAP_FRACTION = 0.15;

const WEIGHT_DENSITY = 0.5;
const WEIGHT_ENGAGEMENT = 0.3;
const WEIGHT_HOOK = 0.1;
const WEIGHT_CLEAN_END = 0.1;

interface RawWindow {
  startIndex: number;
  endIndex: number;
  start: number;
  end: number;
  density: number;
  engagement: number;
  hook: number;
  cleanEnd: number;
}

function buildRawWindow(sentences: Sentence[], startIndex: number, endIndex: number): RawWindow {
  const slice = sentences.slice(startIndex, endIndex + 1);
  const start = sentences[startIndex]!.start;
  const end = sentences[endIndex]!.end;
  const duration = Math.max(1, end - start);
  const words = slice.reduce((sum, sentence) => sum + sentence.wordCount, 0);
  const engagingCount = slice.filter((sentence) => /[?!]/.test(sentence.text)).length;
  return {
    startIndex,
    endIndex,
    start,
    end,
    density: words / duration,
    engagement: Math.min(1, engagingCount / slice.length),
    hook: /[?!]/.test(sentences[startIndex]!.text) ? 1 : 0,
    cleanEnd: sentences[endIndex]!.gapAfter >= CLEAN_BREAK_GAP ? 1 : 0,
  };
}

/** Überlappung zweier Fenster als Anteil am kürzeren (0 = disjunkt, 1 = enthalten). */
export function overlapFraction(a: HighlightWindow, b: HighlightWindow): number {
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (overlap <= 0) return 0;
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return shorter > 0 ? overlap / shorter : 1;
}

export function selectHeuristicWindows(
  sentences: Sentence[],
  opts: HighlightOptions
): HighlightWindow[] {
  // 1. Für jeden Startsatz das Fenster in [min, max] mit dem saubersten Ende bauen.
  const raw: RawWindow[] = [];
  for (let i = 0; i < sentences.length; i++) {
    let j = i;
    while (j < sentences.length && sentences[j]!.end - sentences[i]!.start < opts.minSeconds) {
      j++;
    }
    if (j >= sentences.length) break; // Restmaterial reicht nicht mehr für die Mindestlänge
    if (sentences[j]!.end - sentences[i]!.start > opts.maxSeconds) continue; // Monster-Satz

    // Innerhalb der erlaubten Spanne das Ende mit der größten Folge-Pause nehmen
    // (bei Gleichstand das spätere → mehr Kontext im Clip).
    let bestJ = j;
    for (
      let k = j;
      k < sentences.length && sentences[k]!.end - sentences[i]!.start <= opts.maxSeconds;
      k++
    ) {
      if (sentences[k]!.gapAfter >= sentences[bestJ]!.gapAfter) bestJ = k;
    }
    raw.push(buildRawWindow(sentences, i, bestJ));
  }
  if (raw.length === 0) return [];

  // 2. Sprechdichte über alle Kandidaten normalisieren und Gesamtscore bilden.
  const densities = raw.map((win) => win.density);
  const minDensity = Math.min(...densities);
  const densityRange = Math.max(...densities) - minDensity;
  const scored: HighlightWindow[] = raw.map((win) => {
    const densityNorm = densityRange > 0 ? (win.density - minDensity) / densityRange : 0.5;
    const score =
      WEIGHT_DENSITY * densityNorm +
      WEIGHT_ENGAGEMENT * win.engagement +
      WEIGHT_HOOK * win.hook +
      WEIGHT_CLEAN_END * win.cleanEnd;
    return {
      start: win.start,
      end: win.end,
      startIndex: win.startIndex,
      endIndex: win.endIndex,
      score: Math.min(1, Math.max(0, score)),
    };
  });

  // 3. Beste Fenster ohne nennenswerte Überlappung wählen (stabil sortiert).
  const ordered = [...scored].sort(
    (a, b) => b.score - a.score || a.startIndex - b.startIndex
  );
  const chosen: HighlightWindow[] = [];
  for (const win of ordered) {
    if (chosen.length >= opts.maxCandidates) break;
    const collides = chosen.some((other) => overlapFraction(win, other) > MAX_OVERLAP_FRACTION);
    if (!collides) chosen.push(win);
  }
  return chosen;
}

/**
 * Polstert ein Fenster leicht (Atmer vor dem ersten Wort, Ausklang nach dem
 * letzten) und klemmt es an die Videogrenzen.
 */
export function padWindow(
  window: HighlightWindow,
  videoDurationSeconds: number,
  preSeconds = 0.35,
  postSeconds = 0.6
): HighlightWindow {
  const end =
    videoDurationSeconds > 0
      ? Math.min(videoDurationSeconds, window.end + postSeconds)
      : window.end + postSeconds;
  return {
    ...window,
    start: Math.max(0, window.start - preSeconds),
    end,
  };
}
