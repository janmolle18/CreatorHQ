// „Instagram API with Instagram Login" — OAuth ohne Facebook-Page.
// Kurzlebiges Token → Long-lived Token (60 Tage), igUserId in authMeta.

const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_insights",
];

export function instagramConfig() {
  return {
    appId: process.env.IG_APP_ID ?? "",
    appSecret: process.env.IG_APP_SECRET ?? "",
    redirectUri: process.env.IG_REDIRECT_URI ?? "",
  };
}

export function getInstagramAuthorizeUrl(state: string): string {
  const config = instagramConfig();
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export interface InstagramTokens {
  accessToken: string;
  expiresAt: Date;
  igUserId: string;
  username: string | null;
  scopes: string[];
}

/** Code → kurzlebiges Token → Long-lived Token (60 Tage). */
export async function exchangeInstagramCode(code: string): Promise<InstagramTokens> {
  const config = instagramConfig();

  const shortRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code,
    }),
  });
  const shortData = (await shortRes.json()) as {
    access_token?: string;
    user_id?: string | number;
    error_message?: string;
    error?: { message?: string };
  };
  if (!shortRes.ok || !shortData.access_token) {
    throw new Error(
      `Instagram OAuth: ${shortData.error_message ?? shortData.error?.message ?? shortRes.status}`
    );
  }

  const longParams = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: shortData.access_token,
  });
  const longRes = await fetch(`${GRAPH}/access_token?${longParams}`);
  const longData = (await longRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!longRes.ok || !longData.access_token) {
    throw new Error(`Instagram Long-lived-Token: ${longData.error?.message ?? longRes.status}`);
  }

  const username = await fetchIgUsername(longData.access_token);
  return {
    accessToken: longData.access_token,
    expiresAt: new Date(Date.now() + (longData.expires_in ?? 60 * 86400) * 1000),
    igUserId: String(shortData.user_id ?? ""),
    username,
    scopes: IG_SCOPES,
  };
}

async function fetchIgUsername(accessToken: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ fields: "username", access_token: accessToken });
    const res = await fetch(`${GRAPH}/me?${params}`);
    const data = (await res.json()) as { username?: string };
    return data.username ?? null;
  } catch {
    return null;
  }
}
