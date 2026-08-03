import { addDays, parseISO } from "date-fns";
import { formatInTz, isValidSlot, slotToUtc } from "@creatorhq/shared";

// Reine Slot-Planung — ohne DB/Env, damit die Zeitzonen-Logik isoliert
// testbar ist (inkl. DST-Wechsel). Behebt ClipPilots Container-UTC-Bug:
// Slots sind IMMER lokale Wandzeiten in der konfigurierten Zeitzone.

export const DEFAULT_TIME_SLOTS = ["09:00", "14:00", "19:00"];
export const DEFAULT_CLIPS_PER_DAY = 1;

/** Mindestvorlauf: Slots, die näher als 5 Minuten liegen, werden übersprungen. */
const MIN_LEAD_MS = 5 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = 60;

export interface FindSlotInput {
  timeZone: string;
  /** Lokale Wandzeiten ["09:00","14:00","19:00"] in timeZone. */
  timeSlots: string[];
  /** Max. Posts pro lokalem Tag auf dieser Plattform. */
  clipsPerDay: number;
  now: Date;
  /** Bereits belegte Slots (scheduledAt bestehender Posts der Plattform). */
  occupied: Date[];
}

/**
 * Findet den nächsten freien Slot als UTC-Instant.
 * Regeln: nur Zukunft (mit Vorlauf), pro lokalem Tag höchstens clipsPerDay,
 * kein doppelt belegter Instant. null, wenn 60 Tage voll sind.
 */
export interface CommonSlotInput {
  timeZone: string;
  /** Gemeinsames Slot-Raster (lokale Wandzeiten). */
  timeSlots: string[];
  now: Date;
  /** Je Ziel-Plattform: Tageskappe + bereits belegte Instants. */
  platforms: Array<{ platform: string; clipsPerDay: number; occupied: Date[] }>;
}

/**
 * Ein Video = EIN Zeitpunkt: findet den nächsten Slot, der auf ALLEN
 * Ziel-Plattformen frei ist (Tageskappe je Plattform respektiert, kein
 * belegter Instant irgendwo). Beendet das „Gemische": derselbe Clip taucht
 * im Plan nur noch einmal auf, statt je Plattform verstreut.
 */
export function findNextCommonSlot(input: CommonSlotInput): Date | null {
  if (input.platforms.length === 0) return null;
  const slots = [...input.timeSlots].filter(isValidSlot).sort();
  if (slots.length === 0) return null;

  const perPlatform = input.platforms.map((entry) => {
    const byDay = new Map<string, number>();
    const instants = new Set<number>();
    for (const instant of entry.occupied) {
      const day = formatInTz(instant, input.timeZone, "yyyy-MM-dd");
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      instants.add(instant.getTime());
    }
    return { perDay: Math.max(1, entry.clipsPerDay), byDay, instants };
  });

  const startDay = formatInTz(input.now, input.timeZone, "yyyy-MM-dd");
  for (let offset = 0; offset < MAX_LOOKAHEAD_DAYS; offset++) {
    const day = formatInTz(
      addDays(parseISO(`${startDay}T12:00:00Z`), offset),
      "UTC",
      "yyyy-MM-dd"
    );
    if (perPlatform.some((p) => (p.byDay.get(day) ?? 0) >= p.perDay)) continue;

    for (const slot of slots) {
      const instant = slotToUtc(day, slot, input.timeZone);
      if (instant.getTime() < input.now.getTime() + MIN_LEAD_MS) continue;
      if (perPlatform.some((p) => p.instants.has(instant.getTime()))) continue;
      return instant;
    }
  }
  return null;
}

export function findNextFreeSlot(input: FindSlotInput): Date | null {
  const slots = [...input.timeSlots].filter(isValidSlot).sort();
  if (slots.length === 0) return null;
  const perDay = Math.max(1, input.clipsPerDay);

  const occupiedByDay = new Map<string, number>();
  const occupiedInstants = new Set<number>();
  for (const instant of input.occupied) {
    const day = formatInTz(instant, input.timeZone, "yyyy-MM-dd");
    occupiedByDay.set(day, (occupiedByDay.get(day) ?? 0) + 1);
    occupiedInstants.add(instant.getTime());
  }

  const startDay = formatInTz(input.now, input.timeZone, "yyyy-MM-dd");
  for (let offset = 0; offset < MAX_LOOKAHEAD_DAYS; offset++) {
    // Tag-Iteration über UTC-Mittag vermeidet DST-Kanten bei addDays.
    const day = formatInTz(
      addDays(parseISO(`${startDay}T12:00:00Z`), offset),
      "UTC",
      "yyyy-MM-dd"
    );
    if ((occupiedByDay.get(day) ?? 0) >= perDay) continue;

    for (const slot of slots) {
      const instant = slotToUtc(day, slot, input.timeZone);
      if (instant.getTime() < input.now.getTime() + MIN_LEAD_MS) continue;
      if (occupiedInstants.has(instant.getTime())) continue;
      return instant;
    }
  }
  return null;
}
