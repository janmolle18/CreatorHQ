"use server";

import { db, socialAccounts } from "@creatorhq/db";
import { isValidSlot, publishPlatformSchema } from "@creatorhq/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mitMandant } from "@/lib/auth";

const planSchema = z.object({
  platform: publishPlatformSchema,
  clipsPerDay: z.coerce.number().int().min(1).max(10),
  timeSlots: z
    .string()
    .transform((raw) =>
      raw
        .split(",")
        .map((slot) => slot.trim())
        .filter(Boolean)
    )
    .refine((slots) => slots.length > 0, "Mindestens ein Slot (z. B. 09:00)")
    .refine(
      (slots) => slots.every(isValidSlot),
      "Slots im Format HH:mm, kommagetrennt (z. B. 09:00,14:00,19:00)"
    )
    .transform((slots) => [...new Set(slots)].sort()),
});

/** Posting-Plan (Slots + Kappe) je Plattform speichern — auch ohne OAuth nutzbar. */
export async function savePostingPlanAction(formData: FormData): Promise<void> {
  const parsed = planSchema.safeParse({
    platform: formData.get("platform"),
    clipsPerDay: formData.get("clipsPerDay"),
    timeSlots: formData.get("timeSlots") ?? "",
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Ungültige Eingabe";
    redirect(`/accounts?error=${encodeURIComponent(message)}`);
  }

  const { platform, clipsPerDay, timeSlots } = parsed.data;
  const values = { clipsPerDay, timeSlots, updatedAt: new Date() };
  await mitMandant(async (tx, session) => {
    await tx
      .insert(socialAccounts)
      .values({ tenantId: session.tenantId, platform, ...values })
      // Ziel ist jetzt das Paar aus Mandant und Plattform — mit der alten,
      // global eindeutigen Spalte hätte der zweite Kunde den ersten überschrieben.
      .onConflictDoUpdate({
        target: [socialAccounts.tenantId, socialAccounts.platform],
        set: values,
      });
  });

  revalidatePath("/accounts");
  redirect("/accounts?saved=1");
}
