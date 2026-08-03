import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger.ts";
import { TMP_DIR } from "../integrations/storage.ts";

// Housekeeping: tmp/ wächst sonst unbegrenzt (Quell-mp4s, Render-Reste).
// Aktive Jobs fassen nur frische Dateien an → 3 Tage Alter ist sicher;
// gelöschte Quellvideos lädt downloadKeyToTmp bei Bedarf neu aus MinIO.

const TMP_MAX_AGE_DAYS = 3;

// Der Arbeitsordner ist plattformweit — die Dateien darin tragen bereits die
// Mandanten-Kennung im Namen. Das Handle wird nur entgegengenommen, damit die
// Aufrufstelle einheitlich aussieht.
export async function processCleanup(_db?: unknown): Promise<void> {
  const cutoff = Date.now() - TMP_MAX_AGE_DAYS * 86_400_000;
  const entries = await readdir(TMP_DIR, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  let freedMb = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(TMP_DIR, entry.name);
    const info = await stat(file).catch(() => null);
    if (!info || info.mtimeMs >= cutoff) continue;
    await rm(file, { force: true });
    removed++;
    freedMb += info.size / 1_048_576;
  }

  if (removed > 0) {
    logger.info({ removed, freedMb: Math.round(freedMb) }, "cleanup: tmp aufgeräumt");
  }
}
