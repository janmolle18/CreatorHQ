import { execa } from "execa";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_TIMEZONE, todayInTz } from "@creatorhq/shared";
import { logger } from "../logger.ts";

// Nächtliches Postgres-Backup: pg_dump | gzip → ./backups (Host-Mount).
// Die DB ist das einzig Unersetzliche — MinIO-Medien sind aus den Quellen
// ableitbar. Ein Backup pro Tag (idempotent: gleicher Dateiname wird ersetzt).

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/app/backups";
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

export async function processBackup(): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `creatorhq-${todayInTz(DEFAULT_TIMEZONE)}.sql.gz`);

  // Erst dumpen, dann komprimieren (kein Pipe → dash-sicher, und gzip läuft
  // nur, wenn pg_dump wirklich erfolgreich war). gzip -f ersetzt idempotent.
  const plain = file.replace(/\.gz$/, "");
  await execa("sh", ["-c", `pg_dump "$DATABASE_URL" > "${plain}" && gzip -f "${plain}"`], {
    timeout: DUMP_TIMEOUT_MS,
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
