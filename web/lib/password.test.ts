import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password (scrypt)", () => {
  test("hash + verify roundtrip", () => {
    const hash = hashPassword("mein-sicheres-passwort");

    expect(hash.startsWith("scrypt:16384:8:1:")).toBe(true);
    expect(verifyPassword("mein-sicheres-passwort", hash)).toBe(true);
  });

  test("falsches Passwort wird abgelehnt", () => {
    const hash = hashPassword("richtig");

    expect(verifyPassword("falsch", hash)).toBe(false);
  });

  test("gleiches Passwort ergibt unterschiedliche Hashes (Salt)", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });

  test("kaputte/fremde Hash-Formate werden abgelehnt statt zu werfen", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt:irgendwas")).toBe(false);
    expect(verifyPassword("x", "scrypt:abc:8:1:xx:yy")).toBe(false);
    expect(verifyPassword("x", "scrypt:16384:8:1:nur-fuenf-teile")).toBe(false);
  });

  test("leeres Passwort kann nicht gehasht werden", () => {
    expect(() => hashPassword("")).toThrow();
  });
});
