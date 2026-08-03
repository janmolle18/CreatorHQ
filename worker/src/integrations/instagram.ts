import { env } from "../env.ts";
import { logger } from "../logger.ts";
import { TokenExpiredError } from "./errors.ts";
import { fetchWithRetry } from "./http.ts";

// „Instagram API with Instagram Login" (graph.instagram.com, keine FB-Page).
// Flow: Reel-Container erstellen → Status pollen → publish → Permalink.

const GRAPH = "https://graph.instagram.com";
const API_VERSION = "v23.0";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface IgError {
  error?: { message?: string; code?: number; error_subcode?: number };
}

function mapError(context: string, data: IgError, status: number): Error {
  const code = data.error?.code;
  const message = data.error?.message ?? `HTTP ${status}`;
  if (code === 190) {
    return new TokenExpiredError(`Instagram: ${message}`);
  }
  return new Error(`${context}: ${message}${code ? ` (Code ${code})` : ""}`);
}

/** Long-lived Token verlängern (nutzt das Token selbst, kein Refresh-Token). */
export async function refreshIgToken(
  accessToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  });
  const res = await fetchWithRetry(`${GRAPH}/refresh_access_token?${params}`);
  const data = (await res.json()) as IgError & {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !data.access_token) throw mapError("IG Token-Refresh", data, res.status);
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 60 * 86400) * 1000),
  };
}

/** Reel-Container anlegen; video_url MUSS öffentlich per HTTPS abrufbar sein. */
export async function createReelContainer(opts: {
  igUserId: string;
  accessToken: string;
  videoUrl: string;
  caption: string;
}): Promise<string> {
  const res = await fetchWithRetry(`${GRAPH}/${API_VERSION}/${opts.igUserId}/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: opts.videoUrl,
      caption: opts.caption.slice(0, 2200),
      access_token: opts.accessToken,
    }),
  });
  const data = (await res.json()) as IgError & { id?: string };
  if (!res.ok || !data.id) throw mapError("IG Container", data, res.status);
  return data.id;
}

/** Container-Status pollen, bis Instagram das Video verarbeitet hat. */
export async function waitForContainer(
  containerId: string,
  accessToken: string
): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const params = new URLSearchParams({
      fields: "status_code,status",
      access_token: accessToken,
    });
    const res = await fetchWithRetry(`${GRAPH}/${API_VERSION}/${containerId}?${params}`);
    const data = (await res.json()) as IgError & { status_code?: string; status?: string };
    if (!res.ok) throw mapError("IG Container-Status", data, res.status);

    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error(`IG Container ${data.status_code}: ${data.status ?? "unbekannt"}`);
    }
    if (Date.now() > deadline) {
      throw new Error("IG Container: Timeout beim Verarbeiten (5 min)");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** Fertigen Container veröffentlichen → Media-ID. */
export async function publishContainer(opts: {
  igUserId: string;
  accessToken: string;
  containerId: string;
}): Promise<string> {
  const res = await fetchWithRetry(
    `${GRAPH}/${API_VERSION}/${opts.igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creation_id: opts.containerId,
        access_token: opts.accessToken,
      }),
    }
  );
  const data = (await res.json()) as IgError & { id?: string };
  if (!res.ok || !data.id) throw mapError("IG Publish", data, res.status);
  logger.info({ mediaId: data.id }, "Instagram: Reel veröffentlicht");
  return data.id;
}

/** Permalink zum veröffentlichten Reel. */
export async function fetchPermalink(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ fields: "permalink", access_token: accessToken });
    const res = await fetchWithRetry(`${GRAPH}/${API_VERSION}/${mediaId}?${params}`);
    const data = (await res.json()) as { permalink?: string };
    return data.permalink ?? null;
  } catch {
    return null;
  }
}
