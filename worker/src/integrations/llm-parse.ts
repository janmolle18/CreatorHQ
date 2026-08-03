import { z } from "zod";

// Reine Parsing-/Normalisierungs-Logik für Claude-Captions — ohne Env/IO,
// damit sie isoliert testbar bleibt (llm.ts übernimmt die API-Seite).

export const MAX_HASHTAGS = 6;
export const MAX_CAPTION_LENGTH = 400;

export const captionSchema = z.object({
  caption: z.string().trim().min(1).max(MAX_CAPTION_LENGTH),
  hashtags: z.array(z.string()).max(24),
});

export interface CaptionResult {
  caption: string;
  hashtags: string[];
}

/**
 * Hashtags vereinheitlichen: "#" voranstellen, Leerzeichen/Sonderzeichen raus,
 * Duplikate entfernen, auf MAX_HASHTAGS begrenzen. Umlaute bleiben erhalten.
 */
export function normalizeHashtags(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    const cleaned = entry
      .trim()
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "")
      .toLowerCase();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(`#${cleaned}`);
    if (result.length >= MAX_HASHTAGS) break;
  }
  return result;
}

/**
 * Claude-Antwort → CaptionResult. Toleriert Text um das JSON herum
 * (nimmt den ersten {...}-Block). null bei nicht parsbarer Antwort.
 */
export function parseCaptionJson(raw: string): CaptionResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = captionSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) return null;
    return {
      caption: parsed.data.caption,
      hashtags: normalizeHashtags(parsed.data.hashtags),
    };
  } catch {
    return null;
  }
}

/** Fallback ohne API-Key oder nach zwei Fehlversuchen: brauchbar, editierbar. */
export function heuristicCaption(transcript: string, creatorName: string): CaptionResult {
  const firstSentence = transcript
    .trim()
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim()
    .slice(0, 120);
  const caption = firstSentence && firstSentence.length >= 12
    ? firstSentence
    : `Neuer Clip von ${creatorName}`;
  return {
    caption,
    hashtags: normalizeHashtags([creatorName, "clips", "fürdich"]),
  };
}
