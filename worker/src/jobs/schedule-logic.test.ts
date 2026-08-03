import { describe, expect, test } from "vitest";
import { findNextCommonSlot, findNextFreeSlot } from "./schedule-logic";

const BERLIN = "Europe/Berlin";
const SLOTS = ["09:00", "14:00", "19:00"];

describe("findNextFreeSlot (Zeitzonen + DST)", () => {
  test("Sommer: 09:00 Berlin = 07:00 UTC", () => {
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: SLOTS,
      clipsPerDay: 3,
      now: new Date("2026-07-15T04:00:00.000Z"),
      occupied: [],
    });

    expect(slot?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  test("Winter: 09:00 Berlin = 08:00 UTC", () => {
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: SLOTS,
      clipsPerDay: 3,
      now: new Date("2026-01-15T05:00:00.000Z"),
      occupied: [],
    });

    expect(slot?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  test("vergangene Slots werden übersprungen (14:00 Sommer = 12:00 UTC)", () => {
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: SLOTS,
      clipsPerDay: 3,
      now: new Date("2026-07-15T08:30:00.000Z"), // 10:30 Berlin
      occupied: [],
    });

    expect(slot?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  test("DST-Frühjahr (29.03.2026): alle Slots schon Sommerzeit", () => {
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: ["09:00"],
      clipsPerDay: 1,
      now: new Date("2026-03-29T00:30:00.000Z"),
      occupied: [],
    });

    expect(slot?.toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });

  test("DST-Herbst (25.10.2026): 09:00 wieder Winterzeit", () => {
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: ["09:00"],
      clipsPerDay: 1,
      now: new Date("2026-10-25T00:30:00.000Z"),
      occupied: [],
    });

    expect(slot?.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  test("belegter Instant → nächster Slot am selben Tag", () => {
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: SLOTS,
      clipsPerDay: 3,
      now: new Date("2026-07-15T04:00:00.000Z"),
      occupied: [new Date("2026-07-15T07:00:00.000Z")],
    });

    expect(slot?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  test("clipsPerDay-Kappe: Tag voll → nächster Tag", () => {
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: SLOTS,
      clipsPerDay: 1,
      now: new Date("2026-07-15T04:00:00.000Z"),
      occupied: [new Date("2026-07-15T07:00:00.000Z")], // 1 Post heute → voll
    });

    expect(slot?.toISOString()).toBe("2026-07-16T07:00:00.000Z");
  });

  test("Tagesbelegung zählt in LOKALER Zeit (23:30-Slot bleibt am selben Berliner Tag)", () => {
    // 23:30 Berlin am 15.07. = 21:30 UTC am 15.07. — zählt für den 15.07.
    const slot = findNextFreeSlot({
      timeZone: BERLIN,
      timeSlots: ["23:30"],
      clipsPerDay: 1,
      now: new Date("2026-07-15T04:00:00.000Z"),
      occupied: [new Date("2026-07-15T21:30:00.000Z")],
    });

    expect(slot?.toISOString()).toBe("2026-07-16T21:30:00.000Z");
  });

  test("ungültige Slots werden ignoriert; ohne gültige → null", () => {
    expect(
      findNextFreeSlot({
        timeZone: BERLIN,
        timeSlots: ["25:00", "abc"],
        clipsPerDay: 1,
        now: new Date("2026-07-15T04:00:00.000Z"),
        occupied: [],
      })
    ).toBeNull();
  });
});

describe("findNextCommonSlot (ein Video = ein Zeitpunkt für alle Plattformen)", () => {
  const base = {
    timeZone: BERLIN,
    timeSlots: SLOTS,
    now: new Date("2026-07-15T04:00:00.000Z"),
  };

  test("frei überall → erster Slot, ein gemeinsamer Instant", () => {
    const slot = findNextCommonSlot({
      ...base,
      platforms: [
        { platform: "youtube", clipsPerDay: 1, occupied: [] },
        { platform: "tiktok", clipsPerDay: 1, occupied: [] },
      ],
    });
    expect(slot?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  test("die vollste Plattform bestimmt den Tag", () => {
    const slot = findNextCommonSlot({
      ...base,
      platforms: [
        { platform: "youtube", clipsPerDay: 2, occupied: [] },
        {
          platform: "tiktok",
          clipsPerDay: 1,
          occupied: [new Date("2026-07-15T12:00:00.000Z")],
        },
      ],
    });
    expect(slot?.toISOString()).toBe("2026-07-16T07:00:00.000Z");
  });

  test("belegter Instant auf EINER Plattform blockiert den Slot für alle", () => {
    const slot = findNextCommonSlot({
      ...base,
      platforms: [
        {
          platform: "youtube",
          clipsPerDay: 3,
          occupied: [new Date("2026-07-15T07:00:00.000Z")],
        },
        { platform: "tiktok", clipsPerDay: 3, occupied: [] },
      ],
    });
    expect(slot?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  test("ohne Plattformen kein Slot", () => {
    expect(findNextCommonSlot({ ...base, platforms: [] })).toBeNull();
  });
});
