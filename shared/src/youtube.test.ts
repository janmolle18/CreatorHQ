import { describe, test, expect } from "vitest";
import { parseIsoDuration, chunkIds } from "./youtube";

describe("parseIsoDuration", () => {
  test("liest die Formate, die YouTube tatsächlich liefert", () => {
    expect(parseIsoDuration("PT9S")).toBe(9);
    expect(parseIsoDuration("PT1M31S")).toBe(91);
    expect(parseIsoDuration("PT22M3S")).toBe(1323);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("P1DT2H3M4S")).toBe(93784);
  });

  test("P0D (laufender Livestream) ist unbekannt, nicht null Sekunden", () => {
    expect(parseIsoDuration("P0D")).toBeNull();
    expect(parseIsoDuration("PT0S")).toBeNull();
  });

  test("Unsinn ergibt null statt NaN", () => {
    expect(parseIsoDuration("")).toBeNull();
    expect(parseIsoDuration("22 Minuten")).toBeNull();
  });
});

describe("chunkIds", () => {
  test("bricht bei 50 um — mehr nimmt die API nicht an", () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[1]).toEqual(["id-50"]);
  });

  test("leere Liste ergibt keine Blöcke", () => {
    expect(chunkIds([])).toEqual([]);
  });
});
