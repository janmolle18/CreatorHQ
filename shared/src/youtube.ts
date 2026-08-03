// YouTube Data API v3: Kanal-Uploads auflisten (Discovery + „Kanal scannen").
// Bewusst als reine Funktionen mit apiKey-Parameter — nutzbar aus Worker UND Web.

export interface ChannelVideo {
  externalId: string;
  url: string;
  title: string | null;
  publishedAt: string | null;
}

const API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_PAGE_SIZE = 50;

/**
 * Uploads-Playlist-ID ermitteln.
 * `identifier` ist eine Kanal-ID ("UC…") oder ein Handle ("@name").
 */
async function uploadsPlaylistId(apiKey: string, identifier: string): Promise<string | null> {
  const query = identifier.startsWith("UC")
    ? `id=${identifier}`
    : `forHandle=${encodeURIComponent(identifier.replace(/^@/, ""))}`;
  const res = await fetch(`${API_BASE}/channels?part=contentDetails&${query}&key=${apiKey}`);
  if (!res.ok) throw new Error(`YouTube channels ${res.status}`);
  const data = (await res.json()) as {
    items?: Array<{ contentDetails: { relatedPlaylists: { uploads: string } } }>;
  };
  return data.items?.[0]?.contentDetails.relatedPlaylists.uploads ?? null;
}

/** Dauer + Kennzahlen eines Videos (ein Aufruf liefert beides). */
export interface VideoDetails {
  externalId: string;
  durationSeconds: number | null;
  stats: Record<string, unknown>;
}

// ISO-8601-Dauer: PT9S, PT1M31S, PT22M3S, PT1H2M3S, P1DT2H3M4S — alle Teile optional.
const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * ISO-8601-Dauer in Sekunden. `null` bei unbekannt — insbesondere bei "P0D",
 * das YouTube für laufende Livestreams und noch verarbeitete Uploads liefert
 * (dürfte nie als "0 Sekunden" und damit als Short durchgehen).
 */
export function parseIsoDuration(iso: string): number | null {
  const match = ISO_DURATION.exec(iso.trim());
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return total > 0 ? Math.round(total) : null;
}

/** Zerlegt eine Liste in Blöcke — die videos-API nimmt maximal 50 IDs je Aufruf. */
export function chunkIds(ids: readonly string[], size = MAX_PAGE_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push([...ids.slice(i, i + size)]);
  return chunks;
}

/**
 * Dauer und Kennzahlen zu Video-IDs. Kostet 1 Quota-Unit je 50 IDs — `part`
 * darf beides anfordern, ohne dass es teurer wird. Mehr als 50 IDs in einem
 * Aufruf beantwortet die API mit HTTP 400, deshalb zwingend blockweise.
 */
export async function fetchVideoDetails(
  apiKey: string,
  ids: readonly string[]
): Promise<VideoDetails[]> {
  if (!apiKey) throw new Error("YouTube-API-Key fehlt");
  const details: VideoDetails[] = [];

  for (const batch of chunkIds(ids)) {
    if (batch.length === 0) continue;
    const params = new URLSearchParams({
      part: "contentDetails,statistics",
      id: batch.join(","),
      maxResults: String(MAX_PAGE_SIZE),
      key: apiKey,
    });
    const res = await fetch(`${API_BASE}/videos?${params.toString()}`);
    if (!res.ok) throw new Error(`YouTube videos ${res.status}`);
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        contentDetails?: { duration?: string };
        statistics?: Record<string, unknown>;
      }>;
    };
    for (const item of data.items ?? []) {
      details.push({
        externalId: item.id,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? ""),
        stats: item.statistics ?? {},
      });
    }
  }

  return details;
}

/** Alle Uploads eines Kanals (paginiert, neueste zuerst). */
export async function fetchChannelUploads(
  apiKey: string,
  identifier: string,
  maxTotal = 200
): Promise<ChannelVideo[]> {
  if (!apiKey) throw new Error("YouTube-API-Key fehlt");
  const playlistId = await uploadsPlaylistId(apiKey, identifier);
  if (!playlistId) return [];

  const videos: ChannelVideo[] = [];
  let pageToken = "";
  while (videos.length < maxTotal) {
    const url =
      `${API_BASE}/playlistItems?part=snippet,contentDetails` +
      `&maxResults=${MAX_PAGE_SIZE}&playlistId=${playlistId}&key=${apiKey}` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube playlistItems ${res.status}`);
    const data = (await res.json()) as {
      nextPageToken?: string;
      items?: Array<{
        contentDetails: { videoId: string; videoPublishedAt?: string };
        snippet: { title: string };
      }>;
    };
    for (const item of data.items ?? []) {
      videos.push({
        externalId: item.contentDetails.videoId,
        url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
        title: item.snippet.title,
        publishedAt: item.contentDetails.videoPublishedAt ?? null,
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return videos;
}
