// Google-OAuth für YouTube (Upload + Readonly + Analytics).
// access_type=offline + prompt=consent → Refresh-Token beim ersten Connect.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Berechtigungen, denen David beim Verbinden zustimmt.
 *
 * `youtube.force-ssl` ist Pflicht, um Kommentare zu beantworten. Sie steht
 * hier, obwohl die Antwort-Funktion selbst noch nicht gebaut ist: Der Umfang
 * der Zustimmung wird beim Verbinden festgeschrieben — nachträglich ergänzen
 * hieße, David noch einmal durch den ganzen Vorgang zu schicken.
 *
 * Die Berechtigung muss zusätzlich im Google-Zustimmungsbildschirm eingetragen
 * sein, sonst lehnt Google sie beim Verbinden ab.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  };
}

export function getGoogleAuthorizeUrl(state: string): string {
  const config = googleConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const config = googleConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth: ${data.error_description ?? data.error ?? res.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scopes: (data.scope ?? "").split(" ").filter(Boolean),
  };
}

/** Kanal-Name + ID des verbundenen Accounts. */
export async function fetchChannelInfo(
  accessToken: string
): Promise<{ title: string | null; channelId: string | null }> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = (await res.json()) as {
      items?: Array<{ id: string; snippet?: { title?: string } }>;
    };
    return {
      title: data.items?.[0]?.snippet?.title ?? null,
      channelId: data.items?.[0]?.id ?? null,
    };
  } catch {
    return { title: null, channelId: null };
  }
}
