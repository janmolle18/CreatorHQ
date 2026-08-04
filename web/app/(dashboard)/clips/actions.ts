"use server";

import { clips, posts } from "@creatorhq/db";
import { publishTargetsSchema } from "@creatorhq/shared";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mitMandant, requireSession } from "@/lib/auth";
import { renderQueue } from "@/lib/queues";
import { deleteObject } from "@/lib/storage";

// Alle Aktionen des Clip-Boards (Freigabe → Produktion → Live → Aussortiert).
// Die Review-Aktionen sind hierher gezogen; /review leitet aufs Board um.

const MAX_HASHTAGS = 6;

/** Posts in diesen Zuständen sind draußen oder unterwegs → Clip nicht löschbar. */
const LIVE_POST_STATES = new Set(["uploading", "posted", "published"]);

function parseHashtags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw.split(/[\s,]+/)) {
    const cleaned = entry.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(`#${cleaned}`);
    if (result.length >= MAX_HASHTAGS) break;
  }
  return result;
}

export async function approveClipAction(formData: FormData): Promise<void> {
  const clipId = String(formData.get("clipId") ?? "");
  const parsed = publishTargetsSchema.safeParse(
    formData.getAll("targets").map(String)
  );
  if (!clipId) return;
  if (!parsed.success || parsed.data.length === 0) {
    redirect("/clips?error=" + encodeURIComponent("Mindestens eine Ziel-Plattform wählen"));
  }

  // Kein zusätzliches WHERE auf den Mandanten nötig: Gehört der Clip einem
  // anderen Creator, sieht die Datenbank ihn hier gar nicht.
  await mitMandant((db) =>
    db
      .update(clips)
      .set({ status: "approved", targets: parsed.data, updatedAt: new Date() })
      .where(eq(clips.id, clipId))
  );

  revalidatePath("/clips");
  redirect("/clips?approved=1");
}

export async function rejectClipAction(formData: FormData): Promise<void> {
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return;

  await mitMandant((db) =>
    db
      .update(clips)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(clips.id, clipId))
  );

  revalidatePath("/clips");
}

/** Aussortierten (rejected/failed) Clip zurück in die Freigabe holen. */
export async function restoreClipAction(formData: FormData): Promise<void> {
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return;

  await mitMandant((db) =>
    db
      .update(clips)
      .set({ status: "candidate", error: null, updatedAt: new Date() })
      .where(eq(clips.id, clipId))
  );

  revalidatePath("/clips");
}

/**
 * Clip endgültig löschen: gerendertes Video aus MinIO, Datensatz + Posts
 * (Kaskade). Gesperrt, sobald ein Post live oder unterwegs ist — die
 * Analytics-Historie veröffentlichter Posts bleibt damit unantastbar.
 */
export async function deleteClipAction(formData: FormData): Promise<void> {
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return;

  // redirect() steht bewusst NACH dem Block: Innerhalb der Transaktion wäre
  // die geworfene Umleitung ein Abbruch und würde das Löschen zurücknehmen.
  const ergebnis = await mitMandant(async (db) => {
    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
    if (!clip) return "weg" as const;

    const clipPosts = await db.select().from(posts).where(eq(posts.clipId, clipId));
    if (clipPosts.some((post) => LIVE_POST_STATES.has(post.status))) {
      return "live" as const;
    }

    if (clip.renderedPath) {
      try {
        await deleteObject(clip.renderedPath);
      } catch {
        // Storage-Leiche ist verschmerzbar — der Datensatz soll trotzdem weg.
      }
    }
    await db.delete(clips).where(eq(clips.id, clipId));
    return "geloescht" as const;
  });

  revalidatePath("/clips");
  if (ergebnis === "weg") return;
  if (ergebnis === "live") {
    redirect(
      "/clips?error=" +
        encodeURIComponent("Clip hat veröffentlichte Posts und kann nicht gelöscht werden")
    );
  }
  redirect("/clips?deleted=1");
}

/**
 * SRT-Untertitel manuell korrigieren (Whisper-Fehler, Timing). Leichte
 * Validierung reicht: srtToAss überspringt kaputte Blöcke defensiv.
 * Leeres Feld = Clip wird ohne Untertitel gerendert.
 */
export async function updateSubtitlesAction(formData: FormData): Promise<void> {
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return;

  const raw = String(formData.get("subtitles") ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (raw && !raw.includes("-->")) {
    redirect(
      "/clips?error=" +
        encodeURIComponent(
          "Untertitel brauchen SRT-Zeitzeilen (00:00:01,000 --> 00:00:02,000) — oder Feld leeren"
        )
    );
  }

  await mitMandant((db) =>
    db
      .update(clips)
      .set({ subtitles: raw || null, updatedAt: new Date() })
      .where(eq(clips.id, clipId))
  );

  revalidatePath("/clips");
}

export async function updateClipAction(formData: FormData): Promise<void> {
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return;

  const title = String(formData.get("title") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  const hashtags = parseHashtags(String(formData.get("hashtags") ?? ""));

  await mitMandant((db) =>
    db
      .update(clips)
      .set({
        title: title || null,
        caption: caption || null,
        hashtags,
        updatedAt: new Date(),
      })
      .where(eq(clips.id, clipId))
  );

  revalidatePath("/clips");
}

export async function reRenderClipAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return;

  await renderQueue().add(
    "render",
    { tenantId: session.tenantId, clipId, force: true },
    { jobId: `rerender-${clipId}-${Date.now()}` }
  );
  await mitMandant((db) =>
    db
      .update(clips)
      .set({ status: "rendering", updatedAt: new Date() })
      .where(eq(clips.id, clipId))
  );

  revalidatePath("/clips");
}
