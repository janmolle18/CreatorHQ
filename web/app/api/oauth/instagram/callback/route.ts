import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/origin";
import { db, socialAccounts } from "@creatorhq/db";
import { encryptSecret } from "@creatorhq/shared";
import { exchangeInstagramCode } from "@/lib/instagram";

// Instagram leitet hierher zurück (public via Middleware-Ausnahme /api/oauth/*).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const igError =
    req.nextUrl.searchParams.get("error_description") ??
    req.nextUrl.searchParams.get("error");

  const fail = (message: string) =>
    NextResponse.redirect(
      appUrl(req, `/accounts?error=${encodeURIComponent(message.slice(0, 120))}`)
    );

  if (igError) return fail(`Instagram: ${igError}`);
  if (!code || !state) return fail("OAuth-Antwort unvollständig");

  const expectedState = req.cookies.get("ig_state")?.value;
  if (!expectedState || state !== expectedState) return fail("State ungültig (CSRF-Schutz)");

  try {
    const tokens = await exchangeInstagramCode(code);
    if (!tokens.igUserId) return fail("Keine Instagram-User-ID erhalten");

    const encrypted = encryptSecret(tokens.accessToken);
    const values = {
      handle: tokens.username,
      externalAccountId: tokens.igUserId,
      accessTokenEnc: encrypted,
      // IG refresht mit dem Token selbst → als „Refresh-Token" dasselbe Token.
      refreshTokenEnc: encrypted,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      authMeta: { igUserId: tokens.igUserId },
      status: "connected" as const,
      lastError: null,
      updatedAt: new Date(),
    };
    await db
      .insert(socialAccounts)
      .values({ platform: "instagram", ...values })
      .onConflictDoUpdate({ target: socialAccounts.platform, set: values });

    const res = NextResponse.redirect(appUrl(req, "/accounts?connected=instagram"));
    res.cookies.delete("ig_state");
    return res;
  } catch (error) {
    return fail(String(error instanceof Error ? error.message : error));
  }
}
