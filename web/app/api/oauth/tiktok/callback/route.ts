import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/origin";
import { db, socialAccounts } from "@creatorhq/db";
import { encryptSecret } from "@creatorhq/shared";
import { exchangeCode, fetchUserInfo } from "@/lib/tiktok";

// TikTok leitet hierher zurück (Route ist public — Middleware lässt /api/oauth/* durch).
// State-Cookie schützt gegen CSRF; Tokens werden AES-256-GCM-verschlüsselt gespeichert.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const tiktokError = req.nextUrl.searchParams.get("error");

  const fail = (message: string) =>
    NextResponse.redirect(
      appUrl(req, `/accounts?error=${encodeURIComponent(message.slice(0, 120))}`)
    );

  if (tiktokError) return fail(`TikTok: ${tiktokError}`);
  if (!code || !state) return fail("OAuth-Antwort unvollständig");

  const expectedState = req.cookies.get("tt_state")?.value;
  const verifier = req.cookies.get("tt_pkce")?.value;
  if (!expectedState || state !== expectedState) return fail("State ungültig (CSRF-Schutz)");
  if (!verifier) return fail("PKCE-Verifier fehlt — Flow neu starten");

  try {
    const tokens = await exchangeCode(code, verifier);
    const handle = await fetchUserInfo(tokens.accessToken);

    const values = {
      handle,
      externalAccountId: tokens.openId,
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      authMeta: { tiktokOpenId: tokens.openId },
      status: "connected" as const,
      lastError: null,
      updatedAt: new Date(),
    };
    await db
      .insert(socialAccounts)
      .values({ platform: "tiktok", ...values })
      .onConflictDoUpdate({ target: socialAccounts.platform, set: values });

    const res = NextResponse.redirect(appUrl(req, "/accounts?connected=tiktok"));
    res.cookies.delete("tt_pkce");
    res.cookies.delete("tt_state");
    return res;
  } catch (error) {
    return fail(String(error instanceof Error ? error.message : error));
  }
}
