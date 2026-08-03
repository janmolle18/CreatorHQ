import { db, sourceVideos } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger.ts";
import { deleteObject } from "../integrations/storage.ts";

/**
 * Stuft ein Quellvideo als Referenz ein: Es wird nie geschnitten, zählt nur
 * für die Analyse — und belegt deshalb auch keinen Speicher mehr.
 *
 * Bewusst EINE Funktion für alle drei Wege dorthin (Kanal-Scan, Download-Job,
 * Clip-Job). Vorher gab jeder Weg die Quelldatei unterschiedlich frei, wodurch
 * verwaiste Dateien liegen blieben.
 */
export async function markSourceAsReference(input: {
  sourceVideoId: string;
  storagePath: string | null;
  reason: string;
}): Promise<void> {
  if (input.storagePath) await deleteObject(input.storagePath);

  await db
    .update(sourceVideos)
    .set({
      status: "reference",
      storagePath: null,
      error: input.reason,
      updatedAt: new Date(),
    })
    .where(eq(sourceVideos.id, input.sourceVideoId));

  logger.info(
    { sourceVideoId: input.sourceVideoId, reason: input.reason },
    "Quelle als Referenz eingestuft — wird gemessen, nie geschnitten"
  );
}
