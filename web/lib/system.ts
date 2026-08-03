import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { clips, db, posts, settings, socialAccounts } from "@creatorhq/db";
import {
  DEFAULT_TIMEZONE,
  planNachziehen,
  type NachziehGruppe,
  type NachziehPlan,
} from "@creatorhq/shared";
import { and, asc, eq, gt, inArray, lte, or } from "drizzle-orm";

/** Zustände, in denen ein Post noch aussteht und nachgezogen werden kann. */
const NACHZIEHBAR = ["awaiting_manual", "scheduled", "failed"] as const;

/**
 * Plant die wartenden Posts in die Zukunft — als Vorschau oder zum Anwenden.
 *
 * Ein Video bekommt EINEN Zeitpunkt für alle seine Plattformen, damit im
 * Kalender nicht dasselbe Video dreimal verstreut auftaucht.
 */
export async function nachziehPlan(): Promise<{
  plan: NachziehPlan;
  timeZone: string;
  offen: number;
}> {
  const [config] = await db.select().from(settings).limit(1);
  const timeZone = config?.timezone ?? DEFAULT_TIMEZONE;
  const jetzt = new Date();

  const konten = await db.select().from(socialAccounts);
  const proTag: Record<string, number> = {};
  const raster = new Set<string>();
  for (const konto of konten) {
    proTag[konto.platform] = konto.clipsPerDay;
    for (const slot of konto.timeSlots) raster.add(slot);
  }
  const timeSlots = raster.size > 0 ? [...raster].sort() : ["09:00", "14:00", "19:00"];

  // Überfällig oder wartend — alles, was ohne Zutun nie rausginge.
  const wartend = await db
    .select({
      postId: posts.id,
      clipId: posts.clipId,
      platform: posts.platform,
      scheduledAt: posts.scheduledAt,
    })
    .from(posts)
    .innerJoin(clips, eq(posts.clipId, clips.id))
    .where(
      and(
        inArray(posts.status, [...NACHZIEHBAR]),
        or(lte(posts.scheduledAt, jetzt), eq(posts.status, "awaiting_manual"))
      )
    )
    .orderBy(asc(posts.scheduledAt));

  // Zukünftige Termine bleiben unangetastet und blockieren ihre Slots.
  const kuenftig = await db
    .select({ platform: posts.platform, scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), gt(posts.scheduledAt, jetzt)));
  const belegt: Record<string, Date[]> = {};
  for (const zeile of kuenftig) {
    if (!zeile.scheduledAt) continue;
    (belegt[zeile.platform] ??= []).push(zeile.scheduledAt);
  }

  const proClip = new Map<string, NachziehGruppe>();
  for (const zeile of wartend) {
    const gruppe = proClip.get(zeile.clipId) ?? {
      clipId: zeile.clipId,
      postIds: [],
      platforms: [],
    };
    gruppe.postIds.push(zeile.postId);
    if (!gruppe.platforms.includes(zeile.platform)) gruppe.platforms.push(zeile.platform);
    proClip.set(zeile.clipId, gruppe);
  }

  return {
    plan: planNachziehen({
      timeZone,
      timeSlots,
      now: jetzt,
      gruppen: [...proClip.values()],
      proTag,
      belegt,
    }),
    timeZone,
    offen: wartend.length,
  };
}
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Betriebsdaten für die System-Seite: Sicherung, Zugang, Speicher.
//
// Alles aus vorhandenen Quellen abgeleitet (Dateisystem, MinIO) — bewusst
// ohne neue Tabelle, damit diese Ausbaustufe ohne Migration auskommt.

/** Projektwurzel: web/ läuft direkt auf dem Host, nicht im Container. */
const ROOT = path.resolve(process.cwd(), "..");

export interface BackupInfo {
  /** Jüngste Sicherung, oder null wenn es keine gibt. */
  neuestes: { name: string; alterStunden: number; groesseBytes: number } | null;
  anzahl: number;
  fehler?: string;
}

export async function backupInfo(): Promise<BackupInfo> {
  const verzeichnis = path.join(ROOT, "backups");
  try {
    const dateien = (await readdir(verzeichnis)).filter((name) => name.endsWith(".sql.gz"));
    if (dateien.length === 0) return { neuestes: null, anzahl: 0 };

    const mitZeit = await Promise.all(
      dateien.map(async (name) => {
        const info = await stat(path.join(verzeichnis, name));
        return { name, mtimeMs: info.mtimeMs, groesseBytes: info.size };
      })
    );
    mitZeit.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const neuestes = mitZeit[0]!;
    return {
      anzahl: dateien.length,
      neuestes: {
        name: neuestes.name,
        alterStunden: (Date.now() - neuestes.mtimeMs) / 3_600_000,
        groesseBytes: neuestes.groesseBytes,
      },
    };
  } catch (error) {
    return { neuestes: null, anzahl: 0, fehler: kurz(error) };
  }
}

export interface ZugangInfo {
  /** Adresse, auf die creatorhq.vercel.app aktuell zeigt. */
  tunnelUrl: string | null;
  /** Wann der Wächter das Ziel zuletzt geschrieben hat. */
  syncAlterMinuten: number | null;
  /** Für Instagram muss PUBLIC_MEDIA_BASE_URL auf denselben Tunnel zeigen. */
  medienUrl: string | null;
  medienPasstZumTunnel: boolean;
  fehler?: string;
}

/**
 * Der Quick-Tunnel bekommt bei jedem Neustart eine neue Adresse. Der
 * Sync-Dienst zieht die Weiterleitung nach — PUBLIC_MEDIA_BASE_URL in der
 * .env aber nicht. Weichen beide voneinander ab, ist Instagram-Publishing
 * still blockiert; genau das prüft diese Funktion.
 */
export async function zugangInfo(): Promise<ZugangInfo> {
  const medienUrl = process.env.PUBLIC_MEDIA_BASE_URL?.trim() || null;
  try {
    const zielDatei = path.join(ROOT, "logs", ".link-target");
    const [inhalt, info] = await Promise.all([
      readFile(zielDatei, "utf8"),
      stat(zielDatei),
    ]);
    const tunnelUrl = inhalt.trim() || null;
    return {
      tunnelUrl,
      syncAlterMinuten: (Date.now() - info.mtimeMs) / 60_000,
      medienUrl,
      medienPasstZumTunnel:
        medienUrl !== null && tunnelUrl !== null && medienUrl.startsWith(tunnelUrl),
    };
  } catch (error) {
    return {
      tunnelUrl: null,
      syncAlterMinuten: null,
      medienUrl,
      medienPasstZumTunnel: false,
      fehler: kurz(error),
    };
  }
}

export interface SpeicherPosten {
  name: string;
  bytes: number;
  objekte?: number;
  /** true = aus keiner anderen Quelle wiederherstellbar. */
  unersetzlich?: boolean;
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9004",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

async function praefixGroesse(praefix: string): Promise<{ bytes: number; objekte: number }> {
  let bytes = 0;
  let objekte = 0;
  let token: string | undefined;
  do {
    const antwort = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET ?? "creatorhq",
        Prefix: praefix,
        ContinuationToken: token,
      })
    );
    for (const objekt of antwort.Contents ?? []) {
      bytes += objekt.Size ?? 0;
      objekte += 1;
    }
    token = antwort.IsTruncated ? antwort.NextContinuationToken : undefined;
  } while (token);
  return { bytes, objekte };
}

async function verzeichnisGroesse(relativ: string): Promise<number> {
  const wurzel = path.join(ROOT, relativ);
  let summe = 0;
  const stapel = [wurzel];
  while (stapel.length > 0) {
    const aktuell = stapel.pop()!;
    const eintraege = await readdir(aktuell, { withFileTypes: true });
    for (const eintrag of eintraege) {
      const voll = path.join(aktuell, eintrag.name);
      if (eintrag.isDirectory()) stapel.push(voll);
      else summe += (await stat(voll)).size;
    }
  }
  return summe;
}

export async function speicherPosten(): Promise<SpeicherPosten[]> {
  const posten = await Promise.allSettled([
    praefixGroesse("sources/").then((r) => ({ name: "Quellvideos", ...r })),
    praefixGroesse("clips/").then((r) => ({ name: "Fertige Clips", ...r })),
    praefixGroesse("thumbs/").then((r) => ({ name: "Vorschaubilder", ...r })),
    // Davids hochgeladene Instagram-Clips: die einzigen Dateien im System,
    // die sich aus keiner Quelle neu erzeugen lassen.
    praefixGroesse("imports/").then((r) => ({
      name: "Instagram-Importe",
      ...r,
      unersetzlich: true,
    })),
    verzeichnisGroesse("tmp").then((bytes) => ({ name: "Arbeitsordner", bytes })),
    verzeichnisGroesse("logs").then((bytes) => ({ name: "Protokolle", bytes })),
    verzeichnisGroesse("backups").then((bytes) => ({ name: "Sicherungen", bytes })),
  ]);

  return posten
    .filter((eintrag) => eintrag.status === "fulfilled")
    .map((eintrag) => eintrag.value as SpeicherPosten);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const einheiten = ["KB", "MB", "GB", "TB"];
  let wert = bytes / 1024;
  let index = 0;
  while (wert >= 1024 && index < einheiten.length - 1) {
    wert /= 1024;
    index += 1;
  }
  return `${wert.toFixed(wert >= 100 ? 0 : 1)} ${einheiten[index]}`;
}

export function formatAlter(stunden: number): string {
  if (stunden < 1) return `vor ${Math.max(1, Math.round(stunden * 60))} min`;
  if (stunden < 48) return `vor ${Math.round(stunden)} h`;
  return `vor ${Math.round(stunden / 24)} Tagen`;
}

function kurz(error: unknown): string {
  const nachricht = error instanceof Error ? error.message : String(error);
  return nachricht.length > 120 ? `${nachricht.slice(0, 120)}…` : nachricht;
}
