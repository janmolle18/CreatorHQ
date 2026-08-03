import { describe, expect, test } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

describe("crypto (AES-256-GCM)", () => {
  test("verschlüsselt und entschlüsselt roundtrip-sicher", () => {
    // Arrange
    const plaintext = "oauth-refresh-token-🔐-äöü";

    // Act
    const payload = encryptSecret(plaintext, KEY);
    const decrypted = decryptSecret(payload, KEY);

    // Assert
    expect(decrypted).toBe(plaintext);
    expect(payload).not.toContain(plaintext);
    expect(payload.startsWith("v1.")).toBe(true);
  });

  test("erzeugt pro Aufruf unterschiedliche Payloads (zufällige IV)", () => {
    const first = encryptSecret("same-secret", KEY);
    const second = encryptSecret("same-secret", KEY);

    expect(first).not.toBe(second);
  });

  test("wirft bei falschem Schlüssel", () => {
    const payload = encryptSecret("secret", KEY);

    expect(() => decryptSecret(payload, OTHER_KEY)).toThrow();
  });

  test("wirft bei manipuliertem Ciphertext (Auth-Tag)", () => {
    const payload = encryptSecret("secret", KEY);
    const parts = payload.split(".");
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      parts[3]!.slice(0, -2) + "AA",
    ].join(".");

    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  test("wirft bei ungültigem Payload-Format", () => {
    expect(() => decryptSecret("kein-gueltiges-payload", KEY)).toThrow(
      /Payload-Format/
    );
  });

  test("wirft bei ungültiger Schlüssellänge", () => {
    expect(() => encryptSecret("secret", "zu-kurz")).toThrow(/64 Hex-Zeichen/);
  });
});
