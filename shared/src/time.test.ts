import { describe, expect, test } from "vitest";
import {
  formatInTz,
  isValidSlot,
  isValidTimezone,
  slotToUtc,
  todayInTz,
} from "./time";

const BERLIN = "Europe/Berlin";

describe("time (date-fns-tz)", () => {
  test("Winterzeit: 09:00 Berlin = 08:00 UTC", () => {
    const instant = slotToUtc("2026-01-15", "09:00", BERLIN);

    expect(instant.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  test("Sommerzeit: 09:00 Berlin = 07:00 UTC", () => {
    const instant = slotToUtc("2026-07-15", "09:00", BERLIN);

    expect(instant.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  test("DST-Umstellungstag (29.03.2026): 09:00 ist bereits Sommerzeit", () => {
    const instant = slotToUtc("2026-03-29", "09:00", BERLIN);

    expect(instant.toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });

  test("Rückstellungstag (25.10.2026): 09:00 ist wieder Winterzeit", () => {
    const instant = slotToUtc("2026-10-25", "09:00", BERLIN);

    expect(instant.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  test("formatInTz stellt UTC-Instants als Berliner Wandzeit dar", () => {
    const instant = new Date("2026-07-15T07:00:00.000Z");

    expect(formatInTz(instant, BERLIN, "HH:mm")).toBe("09:00");
  });

  test("todayInTz liefert das Datum aus Sicht der Zone", () => {
    // 23:30 UTC am 14.07. ist in Berlin bereits der 15.07.
    const lateUtc = new Date("2026-07-14T23:30:00.000Z");

    expect(todayInTz(BERLIN, lateUtc)).toBe("2026-07-15");
  });

  test("isValidSlot akzeptiert HH:mm und lehnt Unsinn ab", () => {
    expect(isValidSlot("09:00")).toBe(true);
    expect(isValidSlot("23:59")).toBe(true);
    expect(isValidSlot("24:00")).toBe(false);
    expect(isValidSlot("9:00")).toBe(false);
    expect(isValidSlot("09:60")).toBe(false);
  });

  test("slotToUtc wirft bei ungültigem Slot oder Datum", () => {
    expect(() => slotToUtc("2026-07-15", "25:00", BERLIN)).toThrow(/Slot/);
    expect(() => slotToUtc("15.07.2026", "09:00", BERLIN)).toThrow(/Datum/);
  });

  test("isValidTimezone erkennt IANA-Zonen", () => {
    expect(isValidTimezone("Europe/Berlin")).toBe(true);
    expect(isValidTimezone("Nirgendwo/Falsch")).toBe(false);
  });
});
