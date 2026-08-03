import { addDays, parseISO } from "date-fns";
import { formatInTz, isValidSlot, slotToUtc } from "./time";

// Wartende Posts nachziehen — die Rechnung, die aus „alle sofort" ein
// „über die nächsten Tage verteilt" macht.
//
// Der Anlass: Alle wartenden Posts sind überfällig. Würde man sie einfach auf
// „geplant" setzen, übergäbe der Minuten-Takt sie binnen Minuten alle
// gleichzeitig — YouTubes Tageskontingent reicht für gut sechs Uploads, der
// Rest scheitert und landet nach drei Fehlversuchen wieder im Handbetrieb.
//
// Rein und ohne Datenbank, damit die Verteilung isoliert prüfbar ist.

/** Ein Upload kostet 1600 Einheiten, das Tageskontingent beträgt 10.000. */
export const YOUTUBE_UPLOADS_PRO_TAG = 6;

const MIN_VORLAUF_MS = 5 * 60 * 1000;
const MAX_TAGE = 90;

export interface NachziehGruppe {
  /** Ein Video = ein Zeitpunkt, auch wenn es auf drei Plattformen geht. */
  clipId: string;
  postIds: string[];
  platforms: string[];
}

export interface NachziehEingabe {
  timeZone: string;
  /** Gemeinsames Slot-Raster als lokale Wandzeiten, z. B. ["09:00","18:00"]. */
  timeSlots: string[];
  now: Date;
  gruppen: NachziehGruppe[];
  /** Tageskappe je Plattform (aus den Konto-Einstellungen). */
  proTag: Record<string, number>;
  /** Schon vergebene Zeitpunkte je Plattform — die bleiben unangetastet. */
  belegt: Record<string, Date[]>;
}

export interface NachziehZuweisung {
  clipId: string;
  postIds: string[];
  zeitpunkt: Date;
}

export interface NachziehPlan {
  zuweisungen: NachziehZuweisung[];
  /** Gruppen, für die im Betrachtungszeitraum kein Platz war. */
  ohnePlatz: string[];
  /** Anzahl betroffener Tage — die Zahl, die den Unterschied sichtbar macht. */
  tage: number;
}

/** Tageskappe einer Plattform, nach oben durch das API-Kontingent begrenzt. */
export function kappeFuer(platform: string, konfiguriert: number | undefined): number {
  const wunsch = Math.max(1, konfiguriert ?? 1);
  if (platform === "youtube") return Math.min(wunsch, YOUTUBE_UPLOADS_PRO_TAG);
  return wunsch;
}

/**
 * Verteilt die wartenden Videos auf die nächsten freien Slots.
 *
 * Reihenfolge bleibt, wie sie hereinkommt (der Aufrufer sortiert nach
 * ursprünglichem Termin) — was am längsten wartet, geht zuerst raus.
 */
export function planNachziehen(input: NachziehEingabe): NachziehPlan {
  const slots = [...input.timeSlots].filter(isValidSlot).sort();
  if (slots.length === 0 || input.gruppen.length === 0) {
    return { zuweisungen: [], ohnePlatz: input.gruppen.map((g) => g.clipId), tage: 0 };
  }

  // Belegung je Plattform: wie viele pro lokalem Tag, und welche Zeitpunkte
  // schon vergeben sind. Beides wächst beim Planen mit.
  const proPlattform = new Map<string, { kappe: number; proTag: Map<string, number>; zeitpunkte: Set<number> }>();
  const plattformZustand = (platform: string) => {
    let zustand = proPlattform.get(platform);
    if (!zustand) {
      zustand = {
        kappe: kappeFuer(platform, input.proTag[platform]),
        proTag: new Map(),
        zeitpunkte: new Set(),
      };
      for (const zeitpunkt of input.belegt[platform] ?? []) {
        const tag = formatInTz(zeitpunkt, input.timeZone, "yyyy-MM-dd");
        zustand.proTag.set(tag, (zustand.proTag.get(tag) ?? 0) + 1);
        zustand.zeitpunkte.add(zeitpunkt.getTime());
      }
      proPlattform.set(platform, zustand);
    }
    return zustand;
  };

  const startTag = formatInTz(input.now, input.timeZone, "yyyy-MM-dd");
  const zuweisungen: NachziehZuweisung[] = [];
  const ohnePlatz: string[] = [];
  const belegteTage = new Set<string>();

  for (const gruppe of input.gruppen) {
    const zustaende = gruppe.platforms.map(plattformZustand);
    let gesetzt = false;

    for (let versatz = 0; versatz < MAX_TAGE && !gesetzt; versatz++) {
      // Tagesschritte über UTC-Mittag — vermeidet die Zeitumstellungs-Kanten.
      const tag = formatInTz(
        addDays(parseISO(`${startTag}T12:00:00Z`), versatz),
        "UTC",
        "yyyy-MM-dd"
      );
      if (zustaende.some((z) => (z.proTag.get(tag) ?? 0) >= z.kappe)) continue;

      for (const slot of slots) {
        const zeitpunkt = slotToUtc(tag, slot, input.timeZone);
        if (zeitpunkt.getTime() < input.now.getTime() + MIN_VORLAUF_MS) continue;
        if (zustaende.some((z) => z.zeitpunkte.has(zeitpunkt.getTime()))) continue;

        for (const zustand of zustaende) {
          zustand.proTag.set(tag, (zustand.proTag.get(tag) ?? 0) + 1);
          zustand.zeitpunkte.add(zeitpunkt.getTime());
        }
        zuweisungen.push({ clipId: gruppe.clipId, postIds: gruppe.postIds, zeitpunkt });
        belegteTage.add(tag);
        gesetzt = true;
        break;
      }
    }

    if (!gesetzt) ohnePlatz.push(gruppe.clipId);
  }

  return { zuweisungen, ohnePlatz, tage: belegteTage.size };
}
