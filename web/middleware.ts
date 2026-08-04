import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/auth";

// Schützt alles außer Anmeldung, Registrierung und den OAuth-Rückleitungen.
//
// Bewusst nur eine BILLIGE Prüfung: Läuft die Signatur des Kekses auf, geht es
// zum Login. Ob die Mitgliedschaft noch besteht und der Mandant nicht gekündigt
// ist, prüft requireSession() gegen die Datenbank — hier oben ginge das nicht,
// die Middleware läuft ohne Datenbankzugriff vor jeder einzelnen Anfrage.

const PUBLIC_PREFIXES = [
  "/login",
  "/registrieren",
  "/passwort",
  // Der Bestätigungslink wird oft auf dem Handy geöffnet, während man sich am
  // Rechner registriert hat — dort gibt es keine Sitzung. Das Token selbst ist
  // der Nachweis; die Seite entscheidet, was sie zeigt.
  "/bestaetigen",
  // Impressum, Datenschutz und AGB muessen ohne Anmeldung erreichbar sein:
  // Ein Impressum hinter einem Login erfuellt seinen Zweck nicht, und Google
  // wie Meta pruefen die Datenschutzerklaerung im Rahmen der App-Freigabe.
  "/rechtliches",
  "/api/oauth",
  "/api/public-media",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "");
      const { payload } = await jwtVerify(token, secret);
      if (typeof payload.sub === "string" && typeof payload.tid === "string") {
        return NextResponse.next();
      }
    } catch {
      // ungültig/abgelaufen → Login
    }
  }

  // Absolute URL aus den HEADERN bauen, nicht aus request.url: `next start`
  // ersetzt dort den Host stur durch die Bind-Adresse ("localhost:3000") —
  // hinter dem Tunnel landete man so auf localhost. Host/X-Forwarded-Proto
  // tragen die echte Origin (Tunnel-Domain bzw. 127.0.0.1 lokal).
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  const loginUrl = host
    ? `${proto}://${host}/login`
    : new URL("/login", request.url).toString();
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Statische Assets und Next-Interna nicht anfassen.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
