import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import { TokenExpiredError } from "./errors.ts";
import { fetchWithRetry } from "./http.ts";
import { getRedis } from "./redis.ts";
import { buildVideoMetadata, quotaDayKey, type VideoMetadata } from "./youtube-metadata.ts";

// YouTube Data API v3: Resumable Upload für Shorts (9:16 ≤ 3 min = automatisch Short).
// Quota: videos.insert kostet 1600 Units (Tageslimit 10.000) → Redis-Zähler + Warnung.

const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const UPLOAD_QUOTA_COST = 1600;
const QUOTA_WARN_THRESHOLD = 8000;
const QUOTA_TTL_SECONDS = 48 * 3600;

export { buildVideoMetadata };

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const message = data.error_description ?? data.error ?? String(res.status);
    if (data.error === "invalid_grant") {
      throw new TokenExpiredError(`Google: ${message}`);
    }
    throw new Error(`Google Token-Refresh: ${message}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: null, // Google rotiert Refresh-Tokens beim Refresh nicht
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

/** Quota-Verbrauch buchen; ab 8000 Units/Tag laut warnen. */
export async function trackQuota(units: number, now = new Date()): Promise<number> {
  const key = quotaDayKey(now);
  const redis = getRedis();
  const total = await redis.incrby(key, units);
  await redis.expire(key, QUOTA_TTL_SECONDS);
  if (total >= QUOTA_WARN_THRESHOLD) {
    logger.warn({ total, key }, "YouTube-Quota: über 8000 Units heute — Uploads drosseln");
  }
  return total;
}

/**
 * Resumable Upload: Init liefert die Session-URL, dann streamt der PUT die Datei.
 * Rückgabe: YouTube-Video-ID.
 */
export async function uploadVideo(opts: {
  accessToken: string;
  filePath: string;
  metadata: VideoMetadata;
}): Promise<{ videoId: string }> {
  const { size } = await stat(opts.filePath);

  const initRes = await fetchWithRetry(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(size),
      "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify({
      snippet: {
        title: opts.metadata.title,
        description: opts.metadata.description,
        tags: opts.metadata.tags,
        categoryId: "24", // Entertainment
      },
      status: {
        privacyStatus: env.google.uploadPrivacy,
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  if (initRes.status === 401) {
    throw new TokenExpiredError("YouTube: Access-Token abgelehnt");
  }
  if (!initRes.ok) {
    throw new Error(`YouTube init ${initRes.status}: ${(await initRes.text()).slice(0, 200)}`);
  }
  const sessionUrl = initRes.headers.get("location");
  if (!sessionUrl) throw new Error("YouTube init: keine Upload-Session-URL");

  const stream = createReadStream(opts.filePath);
  const putRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(size),
    },
    body: stream as unknown as BodyInit,
    ...({ duplex: "half" } as Record<string, unknown>),
  });
  if (!putRes.ok) {
    throw new Error(`YouTube upload PUT ${putRes.status}: ${(await putRes.text()).slice(0, 200)}`);
  }
  const data = (await putRes.json()) as { id?: string };
  if (!data.id) throw new Error("YouTube upload: keine Video-ID in der Antwort");

  await trackQuota(UPLOAD_QUOTA_COST);
  logger.info({ videoId: data.id }, "YouTube: Video hochgeladen");
  return { videoId: data.id };
}
