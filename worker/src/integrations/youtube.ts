import { execa } from "execa";
import {
  fetchChannelUploads,
  fetchVideoDetails,
  type ChannelVideo,
  type VideoDetails,
} from "@creatorhq/shared";
import { env } from "../env.ts";
import { logger } from "../logger.ts";

export interface DiscoveredVideo extends ChannelVideo {
  /** Sekunden, sofern die Quelle sie kennt (API immer, yt-dlp nur im /videos-Tab). */
  durationSeconds?: number | null;
  /** true, wenn das Video im /shorts-Tab des Kanals steht. */
  isShort?: boolean;
}

/**
 * Alle Uploads eines Kanals (ID "UC…" oder Handle "@name") — inklusive Dauer,
 * denn die entscheidet, ob ein Video Clip-Material ist oder ein fertiger Short.
 * Bevorzugt die YouTube Data API (braucht YOUTUBE_API_KEY);
 * ohne Key: keyless-Fallback über yt-dlp.
 */
export async function getChannelUploads(identifier: string): Promise<DiscoveredVideo[]> {
  if (env.youtube.apiKey) {
    const videos = await fetchChannelUploads(env.youtube.apiKey, identifier);
    const details = await fetchDetailsSafely(videos.map((video) => video.externalId));
    return videos.map((video) => ({
      ...video,
      durationSeconds: details.get(video.externalId)?.durationSeconds ?? null,
    }));
  }
  logger.warn("YOUTUBE_API_KEY fehlt — Kanal-Scan läuft über yt-dlp-Fallback");
  return listUploadsViaYtdlp(identifier);
}

/** Kennzahlen (Views/Likes/Kommentare) zu Video-IDs — leer ohne API-Key. */
export async function getVideoStats(ids: readonly string[]): Promise<Map<string, VideoDetails>> {
  return fetchDetailsSafely(ids);
}

/**
 * Details holen, ohne den ganzen Scan zu kippen: fällt die videos-API aus,
 * arbeiten wir ohne Dauer weiter — die Sperre im Clip-Job greift trotzdem.
 */
async function fetchDetailsSafely(ids: readonly string[]): Promise<Map<string, VideoDetails>> {
  if (!env.youtube.apiKey || ids.length === 0) return new Map();
  try {
    const details = await fetchVideoDetails(env.youtube.apiKey, ids);
    return new Map(details.map((detail) => [detail.externalId, detail]));
  } catch (err) {
    logger.warn({ err }, "youtube: Video-Details nicht abrufbar — Dauer bleibt offen");
    return new Map();
  }
}

/**
 * Keyless-Discovery über yt-dlp. Wichtig: Shorts stehen NICHT im /videos-Tab,
 * sondern in einem eigenen /shorts-Tab — beide müssen abgefragt werden, sonst
 * fehlen genau die Videos, aus denen wir lernen wollen.
 */
async function listUploadsViaYtdlp(identifier: string): Promise<DiscoveredVideo[]> {
  const base = identifier.startsWith("UC")
    ? `https://www.youtube.com/channel/${identifier}`
    : `https://www.youtube.com/${identifier}`;

  const [longform, shorts] = await Promise.all([
    listTabViaYtdlp(`${base}/videos`, false),
    listTabViaYtdlp(`${base}/shorts`, true),
  ]);
  return [...longform, ...shorts];
}

async function listTabViaYtdlp(url: string, isShort: boolean): Promise<DiscoveredVideo[]> {
  let stdout = "";
  try {
    ({ stdout } = await execa(env.paths.ytdlp, [
      "--flat-playlist",
      "--print",
      "%(id)s\t%(duration)s\t%(title)s",
      "--no-warnings",
      url,
    ]));
  } catch (err) {
    // Ein leerer Tab lässt yt-dlp fehlschlagen — kein Grund, den ganzen Scan
    // zu verlieren.
    logger.warn({ err, url }, "youtube: Kanal-Tab nicht lesbar");
    return [];
  }

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, duration, ...titleParts] = line.split("\t");
      const seconds = Number(duration);
      return {
        externalId: id ?? "",
        url: `https://www.youtube.com/watch?v=${id}`,
        title: titleParts.join("\t") || null,
        publishedAt: null,
        durationSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null,
        isShort,
      };
    })
    .filter((video) => video.externalId.length > 0);
}
