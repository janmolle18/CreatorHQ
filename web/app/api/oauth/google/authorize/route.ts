import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/origin";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { getGoogleAuthorizeUrl, googleConfig } from "@/lib/google";

// Startet den Google-OAuth-Flow für YouTube (Upload/Readonly/Analytics).
export async function GET(req: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.redirect(appUrl(req, "/login"));
  }

  const config = googleConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    return NextResponse.redirect(
      appUrl(
        req,
        "/accounts?error=" +
          encodeURIComponent("YouTube ist noch nicht eingerichtet — wir müssen das freischalten")
      )
    );
  }

  const state = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(getGoogleAuthorizeUrl(state));
  res.cookies.set("g_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
