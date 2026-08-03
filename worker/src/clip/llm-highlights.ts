import { z } from "zod";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import type { Sentence } from "./sentences.ts";
import { overlapFraction, type HighlightWindow } from "./highlight-heuristic.ts";

// Claude wählt Highlight-Fenster aus dem Satz-Transkript (Kontext-Verständnis:
// Setup + Pointe statt Lautstärke-Peaks). Arbeitet auf SATZ-INDIZES statt
// Zeitstempeln — robust gegen Rechenfehler des Modells; die Zeiten mappen wir.
// Ohne ANTHROPIC_API_KEY oder bei Fehlern → null, Aufrufer nutzt die Heuristik.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_ATTEMPTS = 2;
const MAX_PROMPT_CHARS = 150_000;
const MAX_HOOK_LENGTH = 120;
/** Claude-Picks, die sich zu stark doppeln, fliegen raus (Anteil am kürzeren). */
const MAX_PICK_OVERLAP = 0.5;

export const highlightSelectionSchema = z.object({
  clips: z
    .array(
      z.object({
        start_index: z.number().int().min(0),
        end_index: z.number().int().min(0),
        hook: z.string().trim().min(1).max(200),
        score: z.number().min(0).max(1),
      })
    )
    .min(1)
    .max(16),
});

export interface HighlightPick {
  startIndex: number;
  endIndex: number;
  hook: string;
  score: number;
}

export type HookedWindow = HighlightWindow & { hook: string };

/** Claude-Antwort → Picks. Toleriert Text um das JSON herum. */
export function parseHighlightJson(raw: string): HighlightPick[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = highlightSelectionSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) return null;
    return parsed.data.clips.map((clip) => ({
      startIndex: clip.start_index,
      endIndex: clip.end_index,
      hook: clip.hook.slice(0, MAX_HOOK_LENGTH),
      score: clip.score,
    }));
  } catch {
    return null;
  }
}

/**
 * Picks (Satz-Indizes) → Zeitfenster: Indizes klemmen, zu kurze Fenster nach
 * hinten erweitern, zu lange kürzen, unbrauchbare und stark doppelte verwerfen.
 */
export function picksToWindows(
  picks: HighlightPick[],
  sentences: Sentence[],
  opts: { minSeconds: number; maxSeconds: number; maxCandidates: number }
): HookedWindow[] {
  const last = sentences.length - 1;
  if (last < 0) return [];

  const adjusted: HookedWindow[] = [];
  for (const pick of picks) {
    let startIndex = Math.min(last, Math.max(0, Math.min(pick.startIndex, pick.endIndex)));
    let endIndex = Math.min(last, Math.max(0, Math.max(pick.startIndex, pick.endIndex)));

    const duration = () => sentences[endIndex]!.end - sentences[startIndex]!.start;
    while (duration() < opts.minSeconds && endIndex < last) endIndex++;
    while (duration() > opts.maxSeconds && endIndex > startIndex) endIndex--;
    if (duration() < opts.minSeconds || duration() > opts.maxSeconds) continue;

    adjusted.push({
      start: sentences[startIndex]!.start,
      end: sentences[endIndex]!.end,
      startIndex,
      endIndex,
      score: pick.score,
      hook: pick.hook,
    });
  }

  const ordered = [...adjusted].sort((a, b) => b.score - a.score || a.startIndex - b.startIndex);
  const chosen: HookedWindow[] = [];
  for (const win of ordered) {
    if (chosen.length >= opts.maxCandidates) break;
    const doubled = chosen.some((other) => overlapFraction(win, other) > MAX_PICK_OVERLAP);
    if (!doubled) chosen.push(win);
  }
  return chosen;
}

function fmtStart(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildTranscriptPrompt(sentences: Sentence[], videoTitle?: string | null): string {
  const lines = sentences.map(
    (sentence, i) => `[${i}] (${fmtStart(sentence.start)}) ${sentence.text}`
  );
  const header = videoTitle ? `Videotitel: ${videoTitle}\n\nTranskript:\n` : "Transkript:\n";
  const body = header + lines.join("\n");
  return body.length > MAX_PROMPT_CHARS
    ? `${body.slice(0, MAX_PROMPT_CHARS)}\n[… Transkript gekürzt]`
    : body;
}

function systemPrompt(opts: { minSeconds: number; maxSeconds: number; maxCandidates: number }): string {
  return `Du bist Cutter für die Kurzvideo-Clips (TikTok, Reels, Shorts) eines deutschsprachigen YouTube-Creators. Du bekommst das Transkript eines Videos als nummerierte Sätze mit Startzeiten (Minuten:Sekunden).

Wähle bis zu ${opts.maxCandidates} Abschnitte aus, die als eigenständige Clips funktionieren. Regeln:
- Jeder Clip MUSS in sich verständlich sein: Er beginnt mit dem Satz, der den Kontext aufmacht, und endet mit Pointe, Auflösung oder Fazit. Niemals mitten in einem Gedanken starten oder enden.
- Ziellänge ${opts.minSeconds} bis ${opts.maxSeconds} Sekunden (aus den Startzeiten ablesbar).
- Bevorzuge: überraschende Aussagen, Emotionen, konkrete Tipps mit Ergebnis, kleine Geschichten mit Auflösung, starke Meinungen.
- Meide: reine Aufzählungen ohne Schluss, Begrüßungen/Verabschiedungen, Sponsor-Passagen.
- hook: kurzer deutscher Aufhänger für die Caption (max. 90 Zeichen, neugierig machend, keine Emojis, keine Anführungszeichen).
- score: deine Einschätzung 0 bis 1, wie stark der Clip performt.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt der Form:
{"clips":[{"start_index":0,"end_index":0,"hook":"...","score":0.0}]}
start_index/end_index sind die Satz-Nummern in eckigen Klammern (einschließlich).`;
}

export async function selectClaudeHighlights(
  sentences: Sentence[],
  opts: {
    minSeconds: number;
    maxSeconds: number;
    maxCandidates: number;
    videoTitle?: string | null;
  }
): Promise<HookedWindow[] | null> {
  if (!env.anthropic.apiKey) {
    logger.info("selectClaudeHighlights: kein ANTHROPIC_API_KEY — Heuristik übernimmt");
    return null;
  }

  const prompt = buildTranscriptPrompt(sentences, opts.videoTitle);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.anthropic.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: env.anthropic.clipModel,
          max_tokens: 1500,
          system: systemPrompt(opts),
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`Claude API ${response.status}`);

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";
      const picks = parseHighlightJson(text);
      if (!picks) throw new Error("Antwort nicht als Highlight-JSON parsbar");

      const windows = picksToWindows(picks, sentences, opts);
      if (windows.length === 0) throw new Error("Keine Picks überlebten die Längen-Prüfung");
      logger.info({ count: windows.length, model: env.anthropic.clipModel }, "selectClaudeHighlights: Claude-Auswahl aktiv");
      return windows;
    } catch (err) {
      logger.warn({ err, attempt }, "selectClaudeHighlights: Versuch fehlgeschlagen");
    }
  }
  return null;
}
