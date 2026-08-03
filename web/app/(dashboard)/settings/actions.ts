"use server";

import { db, settings } from "@creatorhq/db";
import { isValidTimezone, publishTargetsSchema } from "@creatorhq/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";

const settingsSchema = z.object({
  creatorName: z.string().trim().min(1, "Name fehlt").max(120),
  youtubeChannelId: z.string().trim().max(200),
  twitchUserId: z.string().trim().max(200),
  timezone: z
    .string()
    .trim()
    .refine(isValidTimezone, "Keine gültige IANA-Zeitzone (z. B. Europe/Berlin)"),
  autoDiscovery: z.boolean(),
  defaultTargets: publishTargetsSchema,
});

export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireSession();

  const parsed = settingsSchema.safeParse({
    creatorName: formData.get("creatorName") ?? "",
    youtubeChannelId: formData.get("youtubeChannelId") ?? "",
    twitchUserId: formData.get("twitchUserId") ?? "",
    timezone: formData.get("timezone") ?? "",
    autoDiscovery: formData.get("autoDiscovery") === "on",
    defaultTargets: formData.getAll("defaultTargets").map(String),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Ungültige Eingabe";
    redirect(`/settings?error=${encodeURIComponent(message)}`);
  }

  const data = parsed.data;
  const values = {
    creatorName: data.creatorName,
    youtubeChannelId: data.youtubeChannelId || null,
    twitchUserId: data.twitchUserId || null,
    timezone: data.timezone,
    autoDiscovery: data.autoDiscovery,
    defaultTargets: data.defaultTargets,
    updatedAt: new Date(),
  };

  await db
    .insert(settings)
    .values({ id: "default", ...values })
    .onConflictDoUpdate({ target: settings.id, set: values });

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
