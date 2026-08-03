import type { TranscriptSegment, TranscriptWord } from "@creatorhq/db";

// Baut aus Wort-Timestamps (faster-whisper word_timestamps=True) kurze,
// exakt getimte Untertitel-Cues im TikTok-Stil: 3-5 Wörter, Umbruch an
// Satzzeichen und Sprechpausen, kein Nachleuchten über Stille hinweg.
// Vorher wurden ganze Whisper-Segmente (oft 8-15 Wörter, träges Timing)
// als ein Block eingebrannt — das ist der Kern der „Untertitel ungenau"-Kritik.

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface CueOptions {
  maxWordsPerCue: number;
  maxCharsPerCue: number;
  /** Pause zwischen Wörtern, die einen Umbruch erzwingt (Sekunden). */
  pauseSeconds: number;
  /** Nachlauf hinter dem letzten Wort eines Cues (Sekunden). */
  tailSeconds: number;
  /** Lücken bis zu dieser Größe werden geschlossen → kein Flackern. */
  joinGapSeconds: number;
  /** Kürzere Cues werden verlängert, soweit der nächste Cue Platz lässt. */
  minCueSeconds: number;
}

export const DEFAULT_CUE_OPTIONS: CueOptions = {
  maxWordsPerCue: 5,
  maxCharsPerCue: 30, // ≈ eine Zeile bei Fontgröße 15 auf PlayResX 384 (subtitle-style.ts)
  pauseSeconds: 0.8,
  tailSeconds: 0.15,
  joinGapSeconds: 0.24,
  minCueSeconds: 0.6,
};

const SENTENCE_END = /[.!?…]$/;
const SOFT_END = /[,;:]$/;
const MIN_WORDS_FOR_SOFT_BREAK = 3;

function normalizeWords(words: TranscriptWord[]): TranscriptWord[] {
  return words
    .map((word) => ({ start: word.start, end: word.end, word: word.word.trim() }))
    .filter((word) => word.word.length > 0 && word.end >= word.start);
}

/** Greedy-Gruppierung: Satzzeichen, Pausen und Längen-Limits schließen einen Cue. */
function groupWords(words: TranscriptWord[], opts: CueOptions): TranscriptWord[][] {
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  let currentChars = 0;

  for (const word of words) {
    const prev = current[current.length - 1];
    if (prev) {
      const gap = word.start - prev.end;
      const overflow =
        current.length >= opts.maxWordsPerCue ||
        currentChars + 1 + word.word.length > opts.maxCharsPerCue;
      const sentenceDone = SENTENCE_END.test(prev.word);
      const softDone = SOFT_END.test(prev.word) && current.length >= MIN_WORDS_FOR_SOFT_BREAK;
      if (overflow || gap > opts.pauseSeconds || sentenceDone || softDone) {
        groups.push(current);
        current = [];
        currentChars = 0;
      }
    }
    current = [...current, word];
    currentChars += (currentChars > 0 ? 1 : 0) + word.word.length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function wordsToCues(
  words: TranscriptWord[],
  options?: Partial<CueOptions>
): Cue[] {
  const opts = { ...DEFAULT_CUE_OPTIONS, ...options };
  const groups = groupWords(normalizeWords(words), opts);

  const raw = groups.map((group) => ({
    start: group[0]!.start,
    end: group[group.length - 1]!.end + opts.tailSeconds,
    text: group
      .map((word) => word.word)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  }));

  // Timing glätten: nie in den Folge-Cue laufen, Mindestdauer sichern,
  // Mini-Lücken schließen (Cue endet exakt am Start des nächsten).
  return raw.map((cue, i) => {
    const nextStart = raw[i + 1]?.start;
    let end = nextStart !== undefined ? Math.min(cue.end, nextStart) : cue.end;
    if (end - cue.start < opts.minCueSeconds) {
      end = cue.start + opts.minCueSeconds;
      if (nextStart !== undefined) end = Math.min(end, nextStart);
    }
    if (nextStart !== undefined && nextStart - end <= opts.joinGapSeconds) {
      end = nextStart;
    }
    return { start: cue.start, end, text: cue.text };
  });
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function fmtSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, "0")}`;
}

export function cuesToSrt(cues: Cue[]): string {
  return cues
    .filter((cue) => cue.text.trim().length > 0 && cue.end > cue.start)
    .map(
      (cue, i) =>
        `${i + 1}\n${fmtSrtTime(cue.start)} --> ${fmtSrtTime(cue.end)}\n${cue.text.trim()}\n`
    )
    .join("\n");
}

/**
 * Schneidet die Wörter eines Voll-Transkripts auf ein Clip-Fenster zu und
 * rebasiert sie auf Clip-Zeit (Sekunde 0 = Clip-Start). Zugehörigkeit über
 * die Wort-Mitte → Randwörter kippen eindeutig in genau ein Fenster.
 */
export function sliceTranscriptWords(
  segments: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number
): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (const segment of segments) {
    if (segment.end < startSeconds || segment.start > endSeconds) continue;
    for (const word of segment.words) {
      const mid = (word.start + word.end) / 2;
      if (mid < startSeconds || mid > endSeconds) continue;
      out.push({
        start: Math.max(0, word.start - startSeconds),
        end: Math.max(0, word.end - startSeconds),
        word: word.word,
      });
    }
  }
  return out;
}

/**
 * Cues für ein Clip-Fenster, rebasiert auf Clip-Zeit. Pro Segment: mit
 * Wort-Timestamps entstehen kurze Wort-Cues; Segmente OHNE Wörter (Whisper-
 * Alignment-Ausfall bei lauten Stellen) bleiben als Block-Cue erhalten,
 * statt still zu verschwinden. Cue-Enden sind an die Fensterlänge geklemmt.
 */
export function windowCues(
  segments: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number,
  options?: Partial<CueOptions>
): Cue[] {
  const windowLength = endSeconds - startSeconds;
  const cues: Cue[] = [];
  let buffer: TranscriptWord[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      cues.push(...wordsToCues(buffer, options));
      buffer = [];
    }
  };

  for (const segment of segments) {
    if (segment.end < startSeconds || segment.start > endSeconds) continue;
    if (segment.words.length > 0) {
      buffer = [...buffer, ...sliceTranscriptWords([segment], startSeconds, endSeconds)];
    } else if (segment.text.trim()) {
      flush();
      cues.push({
        start: Math.max(0, segment.start - startSeconds),
        end: Math.max(0, Math.min(segment.end, endSeconds) - startSeconds),
        text: segment.text.trim(),
      });
    }
  }
  flush();

  return cues
    .map((cue) => ({ ...cue, end: Math.min(cue.end, windowLength) }))
    .filter((cue) => cue.end > cue.start);
}

/**
 * SRT für einen Clip aus bereits clip-relativen Whisper-Segmenten
 * (Fallback-Pfad: Fenster-Audio wurde einzeln transkribiert).
 */
export function buildClipSrt(
  segments: TranscriptSegment[],
  options?: Partial<CueOptions>
): string {
  return cuesToSrt(windowCues(segments, 0, Number.POSITIVE_INFINITY, options));
}
