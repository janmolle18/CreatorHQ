import { createHmac, timingSafeEqual } from "node:crypto";

// Signierte, ablaufende URLs für öffentlich abrufbare Medien (Instagram
// braucht eine öffentliche HTTPS-video_url). Kein offener Bucket: nur Links
// mit gültiger HMAC-Signatur und Ablaufzeit funktionieren; nach Ablauf ist
// nichts mehr erreichbar (= automatischer Cleanup nach dem Publish).

const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

function hmacKey(secretHex: string): Buffer {
  if (!KEY_HEX_PATTERN.test(secretHex)) {
    throw new Error("Signatur-Key muss 64 Hex-Zeichen sein (APP_ENCRYPTION_KEY)");
  }
  return Buffer.from(secretHex, "hex");
}

export function signMediaPath(
  storagePath: string,
  expiresAtEpochSeconds: number,
  secretHex: string
): string {
  return createHmac("sha256", hmacKey(secretHex))
    .update(`${storagePath}\n${expiresAtEpochSeconds}`)
    .digest("base64url");
}

export function verifyMediaSignature(
  storagePath: string,
  expiresAtEpochSeconds: number,
  signature: string,
  secretHex: string,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!Number.isFinite(expiresAtEpochSeconds)) return false;
  if (expiresAtEpochSeconds < nowEpochSeconds) return false;
  const expected = signMediaPath(storagePath, expiresAtEpochSeconds, secretHex);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
