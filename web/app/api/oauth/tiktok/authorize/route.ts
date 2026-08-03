import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/origin";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { generatePkce, getAuthorizeUrl, tiktokConfig } from "@/lib/tiktok";

// Startet den TikTok-OAuth-Flow (PKCE). Verifier + State liegen kurzlebig
// in httpOnly-Cookies; der Callback validiert beides.
export async function GET(req: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.redirect(appUrl(req, "/login"));
  }

  const config = tiktokConfig();
  if (!config.clientKey || !config.clientSecret || !config.redirectUri) {
    return NextResponse.redirect(
      appUrl(
        req,
        "/accounts?error=" +
          encodeURIComponent("TikTok ist noch nicht eingerichtet — Jan muss das freischalten")
      )
    );
  }

  const { verifier, challenge } = generatePkce();
  const state = randomBytes(16).toString("base64url");

  const res = NextResponse.redirect(getAuthorizeUrl(state, challenge));
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("tt_pkce", verifier, cookieOptions);
  res.cookies.set("tt_state", state, cookieOptions);
  return res;
}
