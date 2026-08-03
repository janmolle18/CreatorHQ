import type { TranscriptSegment, TranscriptWord } from "@creatorhq/db";

// Zerlegt ein Wort-Transkript in Sätze mit exakten Zeitgrenzen.
// Sätze sind die Grundeinheit der Clip-Auswahl: Clips beginnen und enden
// IMMER an Satzgrenzen — nie mehr mitten im Gedanken (Kontext-Fix).
// Segmente OHNE Wort-Timestamps (Whisper-Alignment-Ausfall bei einzelnen
// lauten Stellen) werden als eigene Sätze übernommen statt still zu fehlen.

export interface Sentence {
  start: number;
  end: number;
  text: string;
  wordCount: number;
  /** Pause bis zum Folgesatz in Sekunden; letzter Satz bekommt 999. */
  gapAfter: number;
}

const SENTENCE_END = /[.!?…]["»«"]?$/;
/** Satzzeichen zählt nur mit hörbarer Pause oder am Segmentende (schützt „z. B."). */
const PUNCT_GAP_SECONDS = 0.25;
/** Lange Sprechpause trennt auch ohne Satzzeichen. */
const HARD_PAUSE_SECONDS = 1.2;
const LAST_SENTENCE_GAP = 999;

interface FlatWord extends TranscriptWord {
  isSegmentFinal: boolean;
}

type StreamItem =
  | { kind: "word"; word: FlatWord }
  | { kind: "segment"; segment: TranscriptSegment };

/** Wörter (mit Segmentende-Marker) und wortlose Text-Segmente in Zeitreihenfolge. */
function toStream(segments: TranscriptSegment[]): StreamItem[] {
  return segments.flatMap((segment): StreamItem[] => {
    const words = segment.words
      .map((word) => ({ ...word, word: word.word.trim() }))
      .filter((word) => word.word.length > 0);
    if (words.length > 0) {
      return words.map((word, i) => ({
        kind: "word",
        word: { ...word, isSegmentFinal: i === words.length - 1 },
      }));
    }
    return segment.text.trim() ? [{ kind: "segment", segment }] : [];
  });
}

function fromWords(words: TranscriptWord[]): Omit<Sentence, "gapAfter"> {
  return {
    start: words[0]!.start,
    end: words[words.length - 1]!.end,
    text: words
      .map((word) => word.word)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    wordCount: words.length,
  };
}

function fromSegment(segment: TranscriptSegment): Omit<Sentence, "gapAfter"> {
  const text = segment.text.replace(/\s+/g, " ").trim();
  return {
    start: segment.start,
    end: segment.end,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

export function segmentsToSentences(segments: TranscriptSegment[]): Sentence[] {
  const stream = toStream(segments);
  const sentences: Array<Omit<Sentence, "gapAfter">> = [];
  let current: TranscriptWord[] = [];
  const flushWords = () => {
    if (current.length > 0) {
      sentences.push(fromWords(current));
      current = [];
    }
  };

  for (let i = 0; i < stream.length; i++) {
    const item = stream[i]!;
    if (item.kind === "segment") {
      flushWords();
      sentences.push(fromSegment(item.segment));
      continue;
    }

    current = [...current, item.word];
    const next = stream[i + 1];
    if (!next) continue;
    if (next.kind === "segment") {
      flushWords();
      continue;
    }
    const gap = next.word.start - item.word.end;
    const punctBreak =
      SENTENCE_END.test(item.word.word) &&
      (item.word.isSegmentFinal || gap > PUNCT_GAP_SECONDS);
    if (punctBreak || gap > HARD_PAUSE_SECONDS) flushWords();
  }
  flushWords();

  return withGaps(sentences);
}

function withGaps(sentences: Array<Omit<Sentence, "gapAfter">>): Sentence[] {
  return sentences.map((sentence, i) => ({
    ...sentence,
    gapAfter:
      i + 1 < sentences.length
        ? Math.max(0, sentences[i + 1]!.start - sentence.end)
        : LAST_SENTENCE_GAP,
  }));
}
