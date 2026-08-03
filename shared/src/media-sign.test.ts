import { describe, expect, test } from "vitest";
import { signMediaPath, verifyMediaSignature } from "./media-sign";

const KEY = "c".repeat(64);
const NOW = 1_800_000_000;

describe("media-sign (öffentliche Medien-URLs)", () => {
  test("gültige Signatur verifiziert", () => {
    const sig = signMediaPath("clips/abc.mp4", NOW + 3600, KEY);

    expect(verifyMediaSignature("clips/abc.mp4", NOW + 3600, sig, KEY, NOW)).toBe(true);
  });

  test("abgelaufene Signatur wird abgelehnt", () => {
    const sig = signMediaPath("clips/abc.mp4", NOW - 1, KEY);

    expect(verifyMediaSignature("clips/abc.mp4", NOW - 1, sig, KEY, NOW)).toBe(false);
  });

  test("manipulierter Pfad oder Ablauf wird abgelehnt", () => {
    const sig = signMediaPath("clips/abc.mp4", NOW + 3600, KEY);

    expect(verifyMediaSignature("clips/OTHER.mp4", NOW + 3600, sig, KEY, NOW)).toBe(false);
    expect(verifyMediaSignature("clips/abc.mp4", NOW + 7200, sig, KEY, NOW)).toBe(false);
    expect(verifyMediaSignature("clips/abc.mp4", NOW + 3600, "kaputt", KEY, NOW)).toBe(false);
  });

  test("anderer Key ergibt andere Signatur", () => {
    const sig = signMediaPath("clips/abc.mp4", NOW + 3600, KEY);

    expect(verifyMediaSignature("clips/abc.mp4", NOW + 3600, sig, "d".repeat(64), NOW)).toBe(
      false
    );
  });

  test("ungültiger Key wirft", () => {
    expect(() => signMediaPath("x", NOW, "zu-kurz")).toThrow(/64 Hex/);
  });
});
