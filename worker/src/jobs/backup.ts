import { execa } from "execa";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_TIMEZONE, todayInTz } from "@creatorhq/shared";
import { logger } from "../logger.ts";

// Nächtliches Postgres-Backup: pg_dump | gzip → ./backups (Host-Mount).
// Die DB ist das einzig Unersetzliche — MinIO-Medien sind aus den Quellen
// ableitbar. Ein Backup pro Tag (idempotent: gleicher Dateiname wird ersetzt).
//
// ── Warum eine EIGENE Verbindung und nicht DATABASE_URL ────────────────────
//
// Die Anwendung verbindet als creatorhq_app — bewusst ohne BYPASSRLS, damit
// die Mandantenregel für sie gilt. pg_dump schaltet `row_security = off` und
// liest dann jede Tabelle; für eine Rolle ohne BYPASSRLS bricht Postgres das
// mit „query would be affected by row-level security policy" ab.
//
// Das heißt: Mit DATABASE_URL scheitert die Sicherung JEDE Nacht — und zwar
// nur mit einer Zeile im Protokoll. Ein Server ohne Sicherungen, der aussieht
// wie einer mit.
//
// Deshalb eine getrennte Rolle (creatorhq_backup): BYPASSRLS, aber nur SELECT.
// Nicht der Eigentümer und kein Superuser: Dieser Prozess führt yt-dlp und
// ffmpeg auf fremdem Videomaterial aus. Wer sich dort festsetzt, soll lesen
// können, was die Sicherung ohnehin enthält — nicht das Schema ändern oder
// über COPY … PROGRAM eine Shell bekommen.

const BACKUP_DIR = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), "..", "backups");
const BACKUP_PATTERN = /^creatorhq-\d{4}-\d{2}-\d{2}\.sql\.gz$/;
export const BACKUP_RETENTION = 14;
const DUMP_TIMEOUT_MS = 10 * 60_000;

/**
 * Wählt aus Backup-Dateinamen die über der Retention liegenden ältesten aus.
 * ISO-Datum im Namen → lexikografische Sortierung ist chronologisch.
 */
export function backupsToPrune(names: string[], keep = BACKUP_RETENTION): string[] {
  const backups = names.filter((name) => BACKUP_PATTERN.test(name)).sort();
  const excess = backups.length - keep;
  return excess > 0 ? backups.slice(0, excess) : [];
}

/**
 * Die Verbindung, mit der gesichert wird — oder eine klare Absage.
 *
 * Kein Rückfall auf DATABASE_URL: Der würde bei jedem Lauf an der
 * Mandantenregel scheitern, und zwar mit einer Meldung, die nach einem
 * Datenbankproblem aussieht statt nach einer fehlenden Einstellung.
 */
export function sicherungsVerbindung(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.BACKUP_DATABASE_URL?.trim();
  if (url) return url;
  throw new Error(
    "BACKUP_DATABASE_URL fehlt — ohne sie gibt es keine Sicherung. Sie muss auf " +
      "die Rolle creatorhq_backup zeigen (BYPASSRLS, nur SELECT); die " +
      "Anwendungsrolle scheitert an der Mandantenregel. Siehe docs/betrieb.md."
  );
}

export async function processBackup(): Promise<void> {
  const verbindung = sicherungsVerbindung();
  await mkdir(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `creatorhq-${todayInTz(DEFAULT_TIMEZONE)}.sql.gz`);

  // Erst dumpen, dann komprimieren (kein Pipe → dash-sicher, und gzip läuft
  // nur, wenn pg_dump wirklich erfolgreich war). gzip -f ersetzt idempotent.
  //
  // Die URL geht als Umgebungsvariable an die Shell, nicht in die Befehlszeile:
  // Sonst stünde das Datenbankpasswort in der Prozessliste jedes Nutzers.
  const plain = file.replace(/\.gz$/, "");
  await execa("sh", ["-c", `pg_dump "$SICHERUNG_URL" > "${plain}" && gzip -f "${plain}"`], {
    timeout: DUMP_TIMEOUT_MS,
    env: { SICHERUNG_URL: verbindung },
  });
  const { size } = await stat(file);
  if (size < 1024) throw new Error(`Backup verdächtig klein (${size} B): ${file}`);

  const names = await readdir(BACKUP_DIR);
  const prune = backupsToPrune(names);
  for (const name of prune) {
    await rm(path.join(BACKUP_DIR, name), { force: true });
  }
  logger.info(
    { file: path.basename(file), sizeKb: Math.round(size / 1024), pruned: prune.length },
    "backup: Postgres-Dump geschrieben"
  );
}
