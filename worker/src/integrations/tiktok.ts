import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import { TokenExpiredError } from "./errors.ts";
import { fetchWithRetry } from "./http.ts";

export { TokenExpiredError };

// TikTok Content Posting API v2 (aus ClipPilot, refactored):
// - Chunked-Upload per Stream statt komplettem File im RAM
// - fetchWithRetry gegen 429/5xx
// - invalid_grant wird als TokenExpiredError signalisiert (→ Account "expired")

const OPEN_API = "https://open.tiktokapis.com";

// TikTok-Chunk-Regeln: 5–64 MB pro Chunk; Dateien ≤ 64 MB als ein Chunk.
const SINGLE_CHUNK_MAX = 64 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024;

export interface TikTokTokens {
  openId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

async function tokenRequest(body: Record<string, string>): Promise<TikTokTokens> {
  const res = await fetchWithRetry(`${OPEN_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.tiktok.clientKey,
      client_secret: env.tiktok.clientSecret,
      ...body,
    }),
  });
  const data = (await res.json()) as {
    open_id?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const message = data.error_description ?? data.error ?? String(res.status);
    if (String(data.error).includes("invalid_grant") || message.includes("invalid_grant")) {
      throw new TokenExpiredError(`TikTok: ${message}`);
    }
    throw new Error(`TikTok OAuth: ${message}`);
  }
  return {
    openId: data.open_id ?? "",
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
  };
}

export function refreshAccessToken(refreshToken: string): Promise<TikTokTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Chunk-Grenzen nach TikTok-Regeln (letzter Chunk schluckt den Rest). */
export function planChunks(totalBytes: number): Array<{ start: number; end: number }> {
  if (totalBytes <= 0) return [];
  if (totalBytes <= SINGLE_CHUNK_MAX) return [{ start: 0, end: totalBytes - 1 }];

  const fullChunks = Math.floor(totalBytes / CHUNK_SIZE);
  const chunks: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < fullChunks; i++) {
    const start = i * CHUNK_SIZE;
    const isLast = i === fullChunks - 1;
    chunks.push({ start, end: isLast ? totalBytes - 1 : start + CHUNK_SIZE - 1 });
  }
  return chunks;
}

/**
 * Video hochladen (Inbox-Modus ohne Audit, Direct Post nach Audit).
 * Streamt die Datei chunk-weise — nie das ganze Video im RAM.
 */
export async function uploadVideo(opts: {
  accessToken: string;
  filePath: string;
  caption: string;
}): Promise<{ publishId: string }> {
  const { size } = await stat(opts.filePath);
  const chunks = planChunks(size);
  if (chunks.length === 0) throw new Error("TikTok: leere Datei");

  const initPath = env.tiktok.directPost
    ? "/v2/post/publish/video/init/"
    : "/v2/post/publish/inbox/video/init/";

  const initBody: Record<string, unknown> = {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: size,
      chunk_size: chunks[0]!.end - chunks[0]!.start + 1,
      total_chunk_count: chunks.length,
    },
  };
  if (env.tiktok.directPost) {
    initBody.post_info = {
      title: opts.caption.slice(0, 2200),
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_comment: false,
      disable_duet: false,
      disable_stitch: false,
    };
  }

  const initRes = await fetchWithRetry(`${OPEN_API}${initPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(initBody),
  });
  const initData = (await initRes.json()) as {
    data?: { publish_id: string; upload_url: string };
    error?: { code: string; message: string };
  };
  if (!initRes.ok || !initData.data) {
    const message = initData.error?.message ?? String(initRes.status);
    if (initData.error?.code === "access_token_invalid") {
      throw new TokenExpiredError(`TikTok init: ${message}`);
    }
    throw new Error(`TikTok init: ${message}`);
  }

  for (const [index, chunk] of chunks.entries()) {
    const length = chunk.end - chunk.start + 1;
    const stream = createReadStream(opts.filePath, { start: chunk.start, end: chunk.end });
    const putRes = await fetchWithRetry(initData.data.upload_url, {
      method: "PUT",
      headers: {
        "content-type": "video/mp4",
        "content-length": String(length),
        "content-range": `bytes ${chunk.start}-${chunk.end}/${size}`,
      },
      body: stream as unknown as BodyInit,
      // Node-fetch braucht duplex bei Stream-Bodies.
      ...({ duplex: "half" } as Record<string, unknown>),
    });
    if (!putRes.ok && putRes.status !== 206) {
      throw new Error(`TikTok upload PUT ${putRes.status} (Chunk ${index + 1}/${chunks.length})`);
    }
  }

  logger.info(
    { publishId: initData.data.publish_id, chunks: chunks.length },
    "TikTok: Video übergeben"
  );
  return { publishId: initData.data.publish_id };
}
