import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { de } from "date-fns/locale";

// Alle Posting-Slots werden als lokale Zeit ("HH:mm") in der konfigurierten
// Zeitzone (settings.timezone) interpretiert und erst hier in UTC-Instants
// umgerechnet — behebt ClipPilots Container-UTC-Bug.

export const DEFAULT_TIMEZONE = "Europe/Berlin";

const SLOT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidSlot(slot: string): boolean {
  return SLOT_PATTERN.test(slot);
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * "2026-07-15" + "09:00" in `timeZone` → UTC-Instant.
 * DST-sicher: date-fns-tz löst die lokale Wandzeit über die IANA-Zone auf.
 */
export function slotToUtc(dayIso: string, slot: string, timeZone: string): Date {
  if (!DAY_PATTERN.test(dayIso)) {
    throw new Error(`Ungültiges Datum "${dayIso}" (erwartet yyyy-MM-dd)`);
  }
  if (!isValidSlot(slot)) {
    throw new Error(`Ungültiger Slot "${slot}" (erwartet HH:mm)`);
  }
  return fromZonedTime(`${dayIso} ${slot}:00`, timeZone);
}

/** Immer deutsch — sonst stünde „Saturday" in einer sonst deutschen Oberfläche. */
export function formatInTz(date: Date, timeZone: string, pattern: string): string {
  return formatInTimeZone(date, timeZone, pattern, { locale: de });
}

/** Aktuelles Datum (yyyy-MM-dd) aus Sicht der Zeitzone. */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}
