import { signMediaPath } from "@creatorhq/shared";
import { env } from "../env.ts";

// Öffentliche HTTPS-URL für einen MinIO-Key (Instagram lädt video_url selbst).
// Weg: fester öffentlicher Origin (benannter Cloudflare Tunnel / eigene Domain)
// → Web-Route /api/public-media/<key> mit HMAC-Signatur + Ablauf.
// Kein offener Bucket; nach Ablauf der Signatur ist der Link tot (Cleanup).

const DEFAULT_TTL_SECONDS = 3600;

export class PublicMediaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicMediaUnavailableError";
  }
}

function publicBaseUrl(): string | null {
  const base = process.env.PUBLIC_MEDIA_BASE_URL || env.appBaseUrl;
  if (!base) return null;
  try {
    const url = new URL(base);
    const isLocal =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname.endsWith(".local");
    if (isLocal || url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** true, wenn eine öffentliche Basis-URL konfiguriert ist. */
export function isPublicMediaAvailable(): boolean {
  return publicBaseUrl() !== null;
}

export function getPublicMediaUrl(
  storagePath: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const base = publicBaseUrl();
  if (!base) {
    throw new PublicMediaUnavailableError(
      "Keine öffentliche HTTPS-Basis-URL — PUBLIC_MEDIA_BASE_URL setzen (benannter Cloudflare Tunnel)"
    );
  }
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signMediaPath(storagePath, expiresAt, env.appEncryptionKey);
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/api/public-media/${encodedPath}?exp=${expiresAt}&sig=${signature}`;
}
