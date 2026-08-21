// Entscheidet, was die Pipeline zerschneiden darf.
//
// Fertige Shorts (und importierte Instagram-Clips) sind Endprodukte:
// Sie werden gemessen, damit wir aus ihrer Performance lernen — aber niemals
// neu geschnitten oder neu gerendert. Geclippt wird ausschließlich Langmaterial
// (YouTube-Langvideos, Twitch-VODs).
//
// Bewusst in shared/, damit Worker und Web dieselbe Regel benutzen.

/**
 * Obergrenze für YouTube Shorts (seit Oktober 2024: 3 Minuten).
 * Alles darunter *kann* ein fertiger Short sein — und wäre als Clip-Quelle
 * ohnehin unbrauchbar, weil ein Clip-Fenster bereits 62–90 s belegt.
 */
export const SHORTFORM_MAX_SECONDS = 180;

export type SourceClassification =
  /** Langmaterial: darf geschnitten werden. */
  | "clip_material"
  /** Fertiges Kurzvideo: zählt nur für die Analyse. */
  | "reference"
  /** Dauer (noch) unbekannt — Entscheidung vertagen. */
  | "unknown";

export interface SourceClassificationInput {
  durationSeconds?: number | null;
  /** Falls die Quelle es direkt weiß (yt-dlp: /shorts-Tab statt /videos-Tab). */
  isShort?: boolean | null;
}

/**
 * Einstufung einer Quelle. Die Dauer entscheidet, weil sie plattformunabhängig
 * gilt und nicht von undokumentierten YouTube-Signalen abhängt.
 */
export function classifySource(input: SourceClassificationInput): SourceClassification {
  if (input.isShort === true) return "reference";

  const duration = input.durationSeconds;
  if (duration === null || duration === undefined) return "unknown";
  if (!Number.isFinite(duration) || duration <= 0) return "unknown";

  return duration > SHORTFORM_MAX_SECONDS ? "clip_material" : "reference";
}

/** Kurzform für die Sperren in Clip- und Download-Job. */
export function isClipMaterial(input: SourceClassificationInput): boolean {
  return classifySource(input) === "clip_material";
}

/** Klartext-Begründung für Log und Oberfläche. */
export function classificationReason(input: SourceClassificationInput): string {
  const classification = classifySource(input);
  if (classification === "clip_material") return "Langmaterial — wird geschnitten";
  if (classification === "unknown") return "Dauer unbekannt";

  const duration = input.durationSeconds;
  return duration === null || duration === undefined
    ? `Fertiger Short — nur Referenz für die Analyse`
    : `Nur ${Math.round(duration)} s — fertiger Short, nur Referenz für die Analyse`;
}
