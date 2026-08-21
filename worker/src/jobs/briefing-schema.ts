import { z } from "zod";

// Striktes Ausgabe-Schema fürs tägliche Claude-Briefing.
// Zod validiert hart — kaputte LLM-Antworten führen zu Retry/failed, nie zu Müll in der DB.

export const briefingResultSchema = z.object({
  summaryMd: z.string().trim().min(20).max(4000),
  contentIdeas: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().min(1).max(1000),
        targetPlatforms: z.array(z.string()).max(3).optional(),
      })
    )
    .min(1)
    .max(8),
  replyCandidates: z
    .array(
      z.object({
        commentId: z.string().trim().min(1),
        whyWorthIt: z.string().trim().min(1).max(500),
        replySketch: z.string().trim().min(1).max(1000),
      })
    )
    .max(5),
  brandRecommendations: z
    .array(
      z.object({
        area: z.string().trim().min(1).max(80),
        finding: z.string().trim().min(1).max(500),
        action: z.string().trim().min(1).max(500),
      })
    )
    .min(1)
    .max(6),
});

export type BriefingResult = z.infer<typeof briefingResultSchema>;

/**
 * Vollständiges Objekt ab `start` (dort steht eine öffnende Klammer) oder null.
 * Klammern innerhalb von Zeichenketten zählen nicht mit.
 */
function balancedObjectAt(raw: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Alle JSON-Objekt-Kandidaten aus einem Text.
 *
 * Bewusst ab JEDER öffnenden Klammer neu ansetzen statt einmal durchzulaufen:
 * Fließtext vor dem JSON kann ein einzelnes Anführungszeichen enthalten
 * („Das ›beste‹ Video" oder ein Apostroph-Zoll), das einen durchgehenden
 * Scan in einen vermeintlichen Zeichenketten-Modus kippen und damit das echte
 * JSON verschlucken würde.
 */
export function extractJsonObjects(raw: string): string[] {
  const objects: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== "{") continue;
    const candidate = balancedObjectAt(raw, i);
    if (candidate !== null) objects.push(candidate);
  }
  return objects;
}

/**
 * Claude-Antwort → BriefingResult. Toleriert Fließtext um das JSON und den
 * Fall, dass das Modell sich selbst korrigiert und mehrere Objekte schickt —
 * dann gewinnt die letzte gültige Fassung. null, wenn nichts passt.
 */
export function parseBriefingJson(raw: string): BriefingResult | null {
  const candidates = extractJsonObjects(raw);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = briefingResultSchema.safeParse(JSON.parse(candidates[i]!));
      if (parsed.success) return parsed.data;
    } catch {
      // nächster Kandidat
    }
  }
  return null;
}
