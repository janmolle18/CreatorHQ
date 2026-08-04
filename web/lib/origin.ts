import type { NextRequest } from "next/server";

/**
 * Die öffentliche Adresse dieser App — für Weiterleitungen aus Route Handlers.
 *
 * Warum nicht einfach `new URL(pfad, req.url)`: `next start` ersetzt den Host
 * in `req.url` stur durch die Bind-Adresse ("localhost:3000"). Hinter dem
 * Proxy landet der Creator damit nach erfolgreicher Zustimmung auf einer toten
 * Seite auf seinem eigenen Gerät. Die Middleware baut ihre Weiterleitung
 * deshalb schon lange aus den Headern (`web/middleware.ts`) — die
 * OAuth-Routen zogen nur nie nach.
 *
 * Reihenfolge: der konfigurierte `APP_BASE_URL` gewinnt (er ist die einzige
 * Quelle, die niemand von außen setzen kann), sonst die Proxy-Header, sonst
 * als letzte Rettung `req.url`.
 */
export function appOrigin(req: NextRequest): string {
  const konfiguriert = process.env.APP_BASE_URL?.trim();
  if (konfiguriert && konfiguriert !== "http://localhost:3000") {
    return konfiguriert.replace(/\/+$/, "");
  }

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    return `${proto}://${host}`;
  }

  return new URL(req.url).origin;
}

/** Absolute URL für eine Weiterleitung innerhalb der App. */
export function appUrl(req: NextRequest, pfad: string): string {
  return new URL(pfad, `${appOrigin(req)}/`).toString();
}
