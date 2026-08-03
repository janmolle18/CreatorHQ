import { env } from "../env.ts";
import { logger } from "../logger.ts";
import {
  heuristicCaption,
  parseCaptionJson,
  type CaptionResult,
} from "./llm-parse.ts";

// Claude API direkt via fetch (kein SDK): Captions für Clip-Kandidaten.
// Ohne ANTHROPIC_API_KEY → Heuristik-Fallback, die Pipeline blockiert nie.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TRANSCRIPT_CHARS = 4000;
const MAX_ATTEMPTS = 2; // 1 Versuch + 1 Retry

const SYSTEM_PROMPT = `Du schreibst deutsche Social-Media-Captions für kurze 9:16-Clips (TikTok, Reels, Shorts) eines YouTube-Creators. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt der Form {"caption": string, "hashtags": string[]}. Regeln: Caption auf Deutsch, 1-2 Sätze, neugierig machend, ohne Emojis, ohne Anführungszeichen um die Caption. Maximal 6 Hashtags, deutschsprachig relevant, ohne #-Zeichen im JSON.`;

interface GenerateCaptionOutput extends CaptionResult {
  source: "claude" | "heuristic";
}

export async function generateCaption(
  transcript: string,
  creatorName: string
): Promise<GenerateCaptionOutput> {
  const fallback = () => ({ ...heuristicCaption(transcript, creatorName), source: "heuristic" as const });

  if (!env.anthropic.apiKey) {
    logger.warn("Kein Claude-Zugang konfiguriert — Caption per Heuristik");
    return fallback();
  }
  const excerpt = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (!excerpt) return fallback();

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
          model: env.anthropic.captionModel,
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Creator: ${creatorName}\nTranskript des Clips:\n"""${excerpt}"""`,
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Claude API ${response.status}`);
      }
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";
      const parsed = parseCaptionJson(text);
      if (parsed) return { ...parsed, source: "claude" };
      throw new Error("Antwort nicht als Caption-JSON parsbar");
    } catch (err) {
      logger.warn({ err, attempt }, "generateCaption: Versuch fehlgeschlagen");
    }
  }
  return fallback();
}
