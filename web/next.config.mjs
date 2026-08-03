/**
 * Erlaubte Absender für Server Actions.
 *
 * Hinter dem Cloudflare-Tunnel kommt Host=localhost:3000 an, der Browser sendet
 * aber Origin=…trycloudflare.com → ohne Freigabe blockt Next alle Server Actions
 * (Login, Freigeben, Löschen …) als Cross-Origin.
 *
 * Der Platzhalter `*.trycloudflare.com` gibt die KOMPLETTE Domain frei — einen
 * Host dort bekommt jeder in Sekunden. Damit fällt die zweite CSRF-Schicht weg
 * und es trägt allein das SameSite-Cookie. Sobald `APP_BASE_URL` auf die feste
 * Domain zeigt, wird nur noch genau dieser Host erlaubt; der Platzhalter greift
 * dann gar nicht mehr.
 */
function allowedOrigins() {
  const erlaubt = ["localhost:3000", "127.0.0.1:3000"];

  const basis = process.env.APP_BASE_URL?.trim();
  if (basis) {
    try {
      const host = new URL(basis).host;
      if (host && !host.startsWith("localhost")) return [...erlaubt, host];
    } catch {
      // Unbrauchbarer Wert → wie ohne Konfiguration weiter.
    }
  }

  // Übergangszustand: wechselnder Quick-Tunnel, feste Domain steht noch aus.
  return [...erlaubt, "*.trycloudflare.com"];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace-Pakete (TS-Quelle) transpilieren
  transpilePackages: ["@creatorhq/db", "@creatorhq/shared"],
  // Native/Server-only Pakete nicht bundeln
  serverExternalPackages: ["postgres"],
  experimental: {
    serverActions: {
      allowedOrigins: allowedOrigins(),
    },
  },
};

export default nextConfig;
