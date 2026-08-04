import { createHash, randomBytes } from "node:crypto";

// TikTok-OAuth (PKCE) für den Web-Flow — Muster 1:1 aus ClipPilot.
// Tokens selbst werden NUR verschlüsselt gespeichert (Callback-Route).

const OPEN_API = "https://open.tiktokapis.com";

export function tiktokConfig() {
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
    clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    redirectUri: process.env.TIKTOK_REDIRECT_URI ?? "",
    directPost: (process.env.TIKTOK_DIRECT_POST ?? "false") === "true",
  };
}

/** PKCE: zufälliger Verifier + abgeleitete SHA256-Challenge (base64url). */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Berechtigungen, denen der Creator beim Verbinden zustimmt.
 *
 * `video.publish` ist bewusst IMMER dabei — auch solange `TIKTOK_DIRECT_POST`
 * noch aus ist. Der Umfang der Zustimmung wird beim Verbinden festgeschrieben:
 * Würden wir die Berechtigung erst nach dem TikTok-Audit anfordern, müsste
 * den Creator ein zweites Mal durch den ganzen Verbindungsvorgang. Ob wirklich direkt
 * veröffentlicht wird, entscheidet weiterhin allein das Flag im Worker.
 *
 * Sollte die Sandbox eine noch nicht freigegebene Berechtigung ablehnen, fällt
 * das beim Anlegen der App auf — nicht erst beim Verbinden.
 */
export const TIKTOK_SCOPES = [
  "user.info.basic",
  "video.upload",
  "video.publish",
  "video.list",
];

export function getAuthorizeUrl(state: string, codeChallenge: string): string {
  const config = tiktokConfig();
  const params = new URLSearchParams({
    client_key: config.clientKey,
    scope: TIKTOK_SCOPES.join(","),
    response_type: "code",
    redirect_uri: config.redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

export interface TikTokTokens {
  openId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<TikTokTokens> {
  const config = tiktokConfig();
  const res = await fetch(`${OPEN_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const data = (await res.json()) as {
    open_id?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok OAuth: ${data.error_description ?? data.error ?? res.status}`);
  }
  return {
    openId: data.open_id ?? "",
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    scopes: (data.scope ?? "").split(",").filter(Boolean),
  };
}

/** Anzeigename/Handle des verbundenen Accounts (user.info.basic). */
export async function fetchUserInfo(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${OPEN_API}/v2/user/info/?fields=display_name,username`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = (await res.json()) as {
      data?: { user?: { display_name?: string; username?: string } };
    };
    return data.data?.user?.username ?? data.data?.user?.display_name ?? null;
  } catch {
    return null;
  }
}
