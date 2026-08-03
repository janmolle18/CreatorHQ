import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/origin";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { getInstagramAuthorizeUrl, instagramConfig } from "@/lib/instagram";

// Startet den Instagram-Login-Flow (Dev-Modus: David muss Instagram-Tester sein).
export async function GET(req: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.redirect(appUrl(req, "/login"));
  }

  const config = instagramConfig();
  if (!config.appId || !config.appSecret || !config.redirectUri) {
    return NextResponse.redirect(
      appUrl(
        req,
        "/accounts?error=" +
          encodeURIComponent("Instagram ist noch nicht eingerichtet — Jan muss das freischalten")
      )
    );
  }

  const state = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(getInstagramAuthorizeUrl(state));
  res.cookies.set("ig_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
