import { env } from "../env.ts";
import type { DiscoveredVideo } from "./youtube.ts";

// Twitch-VOD-Discovery (vorbereitet; aktiv, sobald David auf Twitch streamt
// und TWITCH_CLIENT_ID/SECRET gesetzt sind). 1:1 aus ClipPilot.

const HELIX = "https://api.twitch.tv/helix";
let appToken: { value: string; expiresAt: number } | null = null;

/** App Access Token via Client-Credentials-Grant (gecached bis Ablauf). */
async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
  const params = new URLSearchParams({
    client_id: env.twitch.clientId,
    client_secret: env.twitch.clientSecret,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST" });
  if (!res.ok) throw new Error(`Twitch token ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return appToken.value;
}

async function helix<T>(path: string): Promise<T> {
  const token = await getAppToken();
  const res = await fetch(`${HELIX}${path}`, {
    headers: { "Client-Id": env.twitch.clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch ${path} ${res.status}`);
  return (await res.json()) as T;
}

/** Login-Name → numerische User-ID. */
async function resolveUserId(login: string): Promise<string | null> {
  const data = await helix<{ data: Array<{ id: string }> }>(
    `/users?login=${encodeURIComponent(login)}`
  );
  return data.data[0]?.id ?? null;
}

/** Neueste VODs (Archive) eines Kanals. `loginOrId` = Login-Name oder numerische ID. */
export async function getRecentVods(
  loginOrId: string,
  publishedAfter?: Date
): Promise<DiscoveredVideo[]> {
  if (!env.twitch.clientId || !env.twitch.clientSecret) {
    throw new Error("TWITCH_CLIENT_ID/SECRET fehlt");
  }
  const userId = /^\d+$/.test(loginOrId) ? loginOrId : await resolveUserId(loginOrId);
  if (!userId) return [];
  const data = await helix<{
    data: Array<{ id: string; url: string; title: string; published_at: string }>;
  }>(`/videos?user_id=${userId}&type=archive&first=20`);

  return data.data
    .map((v) => ({
      externalId: v.id,
      url: v.url,
      title: v.title,
      publishedAt: v.published_at,
    }))
    .filter((v) => !publishedAfter || new Date(v.publishedAt) > publishedAfter);
}
