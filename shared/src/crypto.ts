import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM für OAuth-Tokens u. Ä. — Klartext landet NIE in der DB.
// Payload-Format: "v1.<iv>.<authTag>.<ciphertext>" (jeweils base64url).

const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/; // 32 Bytes
const IV_LENGTH = 12; // GCM-Standard-Nonce
const PAYLOAD_VERSION = "v1";

function resolveKey(keyHex?: string): Buffer {
  const hex = keyHex ?? process.env.APP_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("APP_ENCRYPTION_KEY ist nicht gesetzt (openssl rand -hex 32)");
  }
  if (!KEY_HEX_PATTERN.test(hex)) {
    throw new Error("APP_ENCRYPTION_KEY muss genau 64 Hex-Zeichen (32 Bytes) sein");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    PAYLOAD_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== PAYLOAD_VERSION) {
    throw new Error("Ungültiges Secret-Payload-Format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, "base64url");
  const authTag = Buffer.from(tagB64!, "base64url");
  const ciphertext = Buffer.from(dataB64!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
