"use server";

import { calendarItems, db, ideas, settings } from "@creatorhq/db";
import {
  DEFAULT_TIMEZONE,
  isValidSlot,
  publishTargetsSchema,
  slotToUtc,
} from "@creatorhq/shared";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mitMandant } from "@/lib/auth";

const IDEA_STATUSES = ["idea", "planned", "in_production", "published", "discarded"] as const;

const newIdeaSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt").max(160),
  description: z.string().trim().max(1000),
  targetPlatforms: publishTargetsSchema,
});

export async function createIdeaAction(formData: FormData): Promise<void> {
  const parsed = newIdeaSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    targetPlatforms: formData.getAll("targetPlatforms").map(String),
  });
  if (!parsed.success) {
    redirect(
      "/planning?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Ungültige Eingabe")
    );
  }

  await mitMandant((tx, session) =>
    tx.insert(ideas).values({
      tenantId: session.tenantId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      targetPlatforms: parsed.data.targetPlatforms,
      status: "idea",
      source: "manual",
    })
  );
  revalidatePath("/planning");
  redirect("/planning?created=1");
}

export async function setIdeaStatusAction(formData: FormData): Promise<void> {
  const ideaId = String(formData.get("ideaId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ideaId || !(IDEA_STATUSES as readonly string[]).includes(status)) return;

  // Kein zusaetzliches WHERE auf den Mandanten noetig: Gehoert die Idee einem
  // anderen Creator, sieht die Datenbank sie hier gar nicht.
  await mitMandant((tx) =>
    tx
      .update(ideas)
      .set({ status: status as (typeof IDEA_STATUSES)[number], updatedAt: new Date() })
      .where(eq(ideas.id, ideaId))
  );
  revalidatePath("/planning");
  revalidatePath("/calendar");
}

const shootSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum wählen"),
  time: z.string().refine(isValidSlot, "Zeit im Format HH:mm"),
});

/** Aus einer Idee einen Dreh-Termin im Kalender anlegen. */
export async function scheduleShootAction(formData: FormData): Promise<void> {
  const ideaId = String(formData.get("ideaId") ?? "");
  if (!ideaId) return;

  const parsed = shootSchema.safeParse({
    date: formData.get("date") ?? "",
    time: formData.get("time") || "10:00",
  });
  if (!parsed.success) {
    redirect(
      "/planning?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Ungültiger Termin")
    );
  }

  // Ein Durchgang statt drei: Lesen, Anlegen und Umstellen gehoeren zusammen —
  // bricht etwas ab, steht kein Termin ohne umgestellte Idee im Kalender.
  const angelegt = await mitMandant(async (tx, session) => {
    const [idea] = await tx.select().from(ideas).where(eq(ideas.id, ideaId));
    if (!idea) return false;
    const [config] = await tx.select().from(settings).limit(1);
    const timeZone = config?.timezone ?? DEFAULT_TIMEZONE;

    await tx.insert(calendarItems).values({
      tenantId: session.tenantId,
      kind: "shoot",
      title: `Dreh: ${idea.title}`,
      ideaId,
      startsAt: slotToUtc(parsed.data.date, parsed.data.time, timeZone),
      allDay: false,
    });
    // Idee gilt ab jetzt als geplant.
    await tx
      .update(ideas)
      .set({ status: "planned", updatedAt: new Date() })
      .where(eq(ideas.id, ideaId));
    return true;
  });
  if (!angelegt) return;

  revalidatePath("/planning");
  revalidatePath("/calendar");
  redirect("/planning?shoot=1");
}
