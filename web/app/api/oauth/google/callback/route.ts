import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/origin";
import { db, socialAccounts } from "@creatorhq/db";
import { encryptSecret } from "@creatorhq/shared";
import { exchangeGoogleCode, fetchChannelInfo } from "@/lib/google";

// Google leitet hierher zurück (public via Middleware-Ausnahme /api/oauth/*).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const googleError = req.nextUrl.searchParams.get("error");

  const fail = (message: string) =>
    NextResponse.redirect(
      appUrl(req, `/accounts?error=${encodeURIComponent(message.slice(0, 120))}`)
    );

  if (googleError) return fail(`Google: ${googleError}`);
  if (!code || !state) return fail("OAuth-Antwort unvollständig");

  const expectedState = req.cookies.get("g_state")?.value;
  if (!expectedState || state !== expectedState) return fail("State ungültig (CSRF-Schutz)");

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refreshToken) {
      return fail("Kein Refresh-Token erhalten — Zugriff unter myaccount.google.com entfernen und neu verbinden");
    }
    const channel = await fetchChannelInfo(tokens.accessToken);
    const authMeta: Record<string, string> = {};
    if (channel.channelId) authMeta.googleChannelId = channel.channelId;

    const values = {
      handle: channel.title,
      externalAccountId: channel.channelId,
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      authMeta,
      status: "connected" as const,
      lastError: null,
      updatedAt: new Date(),
    };
    await db
      .insert(socialAccounts)
      .values({ platform: "youtube", ...values })
      .onConflictDoUpdate({ target: socialAccounts.platform, set: values });

    const res = NextResponse.redirect(appUrl(req, "/accounts?connected=youtube"));
    res.cookies.delete("g_state");
    return res;
  } catch (error) {
    return fail(String(error instanceof Error ? error.message : error));
  }
}
