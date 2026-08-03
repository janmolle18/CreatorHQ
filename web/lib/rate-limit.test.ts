import { describe, expect, test } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("rate-limit (sliding window)", () => {
  test("erlaubt bis max Versuche, blockt danach", () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000 });
    const t = 1_000_000;

    expect(limiter.check("ip", t)).toBe(true);
    expect(limiter.check("ip", t + 1)).toBe(true);
    expect(limiter.check("ip", t + 2)).toBe(true);
    expect(limiter.check("ip", t + 3)).toBe(false);
  });

  test("Fenster läuft ab: alte Versuche zählen nicht mehr", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    const t = 1_000_000;

    expect(limiter.check("ip", t)).toBe(true);
    expect(limiter.check("ip", t + 1)).toBe(true);
    expect(limiter.check("ip", t + 2)).toBe(false);
    expect(limiter.check("ip", t + 1500)).toBe(true);
  });

  test("Keys sind unabhängig", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    const t = 1_000_000;

    expect(limiter.check("a", t)).toBe(true);
    expect(limiter.check("a", t + 1)).toBe(false);
    expect(limiter.check("b", t + 1)).toBe(true);
  });

  test("reset gibt den Key sofort wieder frei", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const t = 1_000_000;

    expect(limiter.check("ip", t)).toBe(true);
    expect(limiter.check("ip", t + 1)).toBe(false);
    limiter.reset("ip");
    expect(limiter.check("ip", t + 2)).toBe(true);
  });

  test("abgelaufene Schlüssel werden aufgeräumt — sonst wächst die Map unbegrenzt", () => {
    // Genau der Angriff: pro Versuch ein anderer Schlüssel. Ohne Aufräumen
    // bliebe jeder Eintrag für immer im Speicher stehen.
    const limiter = createRateLimiter({ max: 5, windowMs: 1000 });
    const t = 1_000_000;

    for (let i = 0; i < 1200; i++) limiter.check(`gefaelscht-${i}`, t);
    expect(limiter.size()).toBeGreaterThan(1000);

    // Ein Versuch nach Ablauf des Fensters räumt die alten Einträge weg.
    limiter.check("noch-einer", t + 5000);
    expect(limiter.size()).toBeLessThan(10);
  });

  test("frische Schlüssel überleben das Aufräumen", () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000 });
    const t = 1_000_000;

    limiter.check("echte-ip", t);
    for (let i = 0; i < 1200; i++) limiter.check(`gefaelscht-${i}`, t);
    limiter.check("noch-einer", t + 1);

    // Innerhalb des Fensters bleibt alles stehen — auch die echte IP.
    expect(limiter.check("echte-ip", t + 2)).toBe(true);
  });
});
