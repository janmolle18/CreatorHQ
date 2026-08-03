import { formatInTz } from "@creatorhq/shared";

// Reines Metadata-Mapping für YouTube-Uploads — ohne IO, isoliert testbar.
// YouTube-Limits: Titel ≤ 100 Zeichen, keine spitzen Klammern; Tags gesamt
// ≤ 500 Zeichen (inkl. Trennlogik), einzelner Tag ≤ 100 Zeichen.

export const MAX_TITLE_LENGTH = 100;
export const MAX_TAG_LENGTH = 100;
export const MAX_TAGS_TOTAL_LENGTH = 400; // konservativ unter dem 500er-Limit
export const MAX_DESCRIPTION_LENGTH = 4500;

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
}

function sanitize(text: string): string {
  return text.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Titel/Beschreibung/Tags aus Clip-Daten ableiten.
 * Fallback-Kette für den Titel: expliziter Titel → Caption → Standard.
 */
export function buildVideoMetadata(input: {
  title: string | null;
  caption: string | null;
  hashtags: string[];
  creatorName?: string;
}): VideoMetadata {
  const rawTitle =
    sanitize(input.title ?? "") ||
    sanitize(input.caption ?? "") ||
    `Neuer Clip von ${input.creatorName ?? "David"}`;
  const title =
    rawTitle.length > MAX_TITLE_LENGTH
      ? `${rawTitle.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
      : rawTitle;

  const descriptionParts = [input.caption?.trim(), input.hashtags.join(" ")].filter(
    Boolean
  );
  const description = descriptionParts.join("\n\n").slice(0, MAX_DESCRIPTION_LENGTH);

  const tags: string[] = [];
  let totalLength = 0;
  for (const hashtag of input.hashtags) {
    const tag = sanitize(hashtag.replace(/^#+/, ""));
    if (!tag || tag.length > MAX_TAG_LENGTH) continue;
    if (tags.includes(tag)) continue;
    if (totalLength + tag.length > MAX_TAGS_TOTAL_LENGTH) break;
    tags.push(tag);
    totalLength += tag.length;
  }

  return { title, description, tags };
}

/** Quota-Tag im Google-Reset-Rhythmus (Mitternacht Pacific Time). */
export function quotaDayKey(now: Date): string {
  return `yt:quota:${formatInTz(now, "America/Los_Angeles", "yyyy-MM-dd")}`;
}
