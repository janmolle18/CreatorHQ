import { describe, expect, test } from "vitest";
import { kappeFuer, planNachziehen, YOUTUBE_UPLOADS_PRO_TAG } from "./catchup";
import { formatInTz } from "./time";

const TZ = "Europe/Berlin";
const JETZT = new Date("2026-08-03T06:00:00Z"); // 08:00 Berlin

function gruppen(anzahl: number, platforms = ["youtube", "instagram", "tiktok"]) {
  return Array.from({ length: anzahl }, (_, i) => ({
    clipId: `clip-${i}`,
    postIds: platforms.map((p) => `post-${i}-${p}`),
    platforms,
  }));
}

function tagVon(zeitpunkt: Date): string {
  return formatInTz(zeitpunkt, TZ, "yyyy-MM-dd");
}

describe("kappeFuer", () => {
  test("YouTube wird durch das Tageskontingent gedeckelt", () => {
    expect(kappeFuer("youtube", 20)).toBe(YOUTUBE_UPLOADS_PRO_TAG);
  });

  test("unter dem Kontingent gilt der eingestellte Wunsch", () => {
    expect(kappeFuer("youtube", 2)).toBe(2);
  });

  test("andere Plattformen bleiben unbegrenzt vom YouTube-Kontingent", () => {
    expect(kappeFuer("tiktok", 20)).toBe(20);
  });

  test("ohne Angabe gilt eins pro Tag", () => {
    expect(kappeFuer("instagram", undefined)).toBe(1);
  });
});

describe("planNachziehen", () => {
  test("verteilt die wartenden Videos auf Tage statt auf Minuten", () => {
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["09:00", "14:00", "19:00"],
      now: JETZT,
      gruppen: gruppen(10),
      proTag: { youtube: 1, instagram: 1, tiktok: 1 },
      belegt: {},
    });

    expect(plan.zuweisungen).toHaveLength(10);
    expect(plan.ohnePlatz).toHaveLength(0);
    // Eins pro Tag und Plattform → zehn Videos brauchen zehn Tage.
    expect(plan.tage).toBe(10);
    const tage = new Set(plan.zuweisungen.map((z) => tagVon(z.zeitpunkt)));
    expect(tage.size).toBe(10);
  });

  test("kein Zeitpunkt liegt in der Vergangenheit", () => {
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["09:00", "14:00", "19:00"],
      now: JETZT,
      gruppen: gruppen(5),
      proTag: { youtube: 3, instagram: 3, tiktok: 3 },
      belegt: {},
    });

    for (const zuweisung of plan.zuweisungen) {
      expect(zuweisung.zeitpunkt.getTime()).toBeGreaterThan(JETZT.getTime());
    }
  });

  test("YouTube-Kontingent begrenzt, wie viel an einem Tag rausgeht", () => {
    // 20 pro Tag gewünscht — das Kontingent lässt nur sechs zu.
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"],
      now: JETZT,
      gruppen: gruppen(12, ["youtube"]),
      proTag: { youtube: 20 },
      belegt: {},
    });

    const proTag = new Map<string, number>();
    for (const zuweisung of plan.zuweisungen) {
      const tag = tagVon(zuweisung.zeitpunkt);
      proTag.set(tag, (proTag.get(tag) ?? 0) + 1);
    }
    for (const anzahl of proTag.values()) {
      expect(anzahl).toBeLessThanOrEqual(YOUTUBE_UPLOADS_PRO_TAG);
    }
  });

  test("ein Video bekommt EINEN Zeitpunkt für alle seine Plattformen", () => {
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["09:00"],
      now: JETZT,
      gruppen: gruppen(1),
      proTag: { youtube: 1, instagram: 1, tiktok: 1 },
      belegt: {},
    });

    expect(plan.zuweisungen).toHaveLength(1);
    expect(plan.zuweisungen[0]!.postIds).toHaveLength(3);
  });

  test("schon vergebene Zeitpunkte werden nicht überbucht", () => {
    const belegterSlot = new Date("2026-08-03T07:00:00Z"); // 09:00 Berlin
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["09:00", "14:00"],
      now: JETZT,
      gruppen: gruppen(1, ["youtube"]),
      proTag: { youtube: 5 },
      belegt: { youtube: [belegterSlot] },
    });

    expect(plan.zuweisungen[0]!.zeitpunkt.getTime()).not.toBe(belegterSlot.getTime());
  });

  test("belegte Tage zählen gegen die Tageskappe", () => {
    const heuteFrueh = new Date("2026-08-03T07:00:00Z");
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["09:00", "14:00", "19:00"],
      now: JETZT,
      gruppen: gruppen(1, ["youtube"]),
      proTag: { youtube: 1 },
      belegt: { youtube: [heuteFrueh] },
    });

    // Der Tag ist mit dem bestehenden Post ausgeschöpft → erst morgen.
    expect(tagVon(plan.zuweisungen[0]!.zeitpunkt)).toBe("2026-08-04");
  });

  test("ohne Slot-Raster wird nichts geplant, statt irgendetwas zu raten", () => {
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: [],
      now: JETZT,
      gruppen: gruppen(3),
      proTag: {},
      belegt: {},
    });

    expect(plan.zuweisungen).toHaveLength(0);
    expect(plan.ohnePlatz).toHaveLength(3);
  });

  test("nichts zu tun ergibt einen leeren Plan", () => {
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["09:00"],
      now: JETZT,
      gruppen: [],
      proTag: {},
      belegt: {},
    });

    expect(plan.zuweisungen).toHaveLength(0);
    expect(plan.tage).toBe(0);
  });

  test("die Reihenfolge bleibt erhalten — was am längsten wartet, geht zuerst", () => {
    const plan = planNachziehen({
      timeZone: TZ,
      timeSlots: ["09:00"],
      now: JETZT,
      gruppen: gruppen(3, ["tiktok"]),
      proTag: { tiktok: 1 },
      belegt: {},
    });

    expect(plan.zuweisungen.map((z) => z.clipId)).toEqual(["clip-0", "clip-1", "clip-2"]);
    const zeiten = plan.zuweisungen.map((z) => z.zeitpunkt.getTime());
    expect(zeiten).toEqual([...zeiten].sort((a, b) => a - b));
  });
});
