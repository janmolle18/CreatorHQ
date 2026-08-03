import { clips, posts, settings, socialAccounts } from "@creatorhq/db";
import { DEFAULT_TIMEZONE, type PublishPlatform } from "@creatorhq/shared";
import { and, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import type { Job } from "bullmq";
import { logger } from "../logger.ts";
import { imAuftragsMandanten } from "../tenant.ts";
import type { ClipJob } from "../queues.ts";
import {
  DEFAULT_CLIPS_PER_DAY,
  DEFAULT_TIME_SLOTS,
  findNextCommonSlot,
} from "./schedule-logic.ts";

// Ein Video = EIN Zeitpunkt: alle Ziel-Plattformen eines Clips bekommen
// denselben Slot (kein „Gemische" mehr — derselbe Clip taucht im Plan nur
// einmal auf). Slots sind lokale Wandzeiten in settings.timezone; ohne
// verbundenen Account entsteht awaiting_manual MIT geplanter Zeit.

const OCCUPANCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Gemeinsames Raster: identische Account-Slots aller Ziele, sonst Default. */
function commonTimeSlots(
  accounts: Array<{ timeSlots: string[] } | undefined>,
): string[] {
  const lists = accounts.map((account) =>
    account && account.timeSlots.length > 0
      ? [...account.timeSlots].sort().join("|")
      : null,
  );
  const first = lists[0];
  if (first && lists.every((list) => list === first)) return first.split("|");
  return DEFAULT_TIME_SLOTS;
}

export async function processSchedule(job: Job<ClipJob>): Promise<void> {
  const { clipId } = job.data;
  await imAuftragsMandanten(job, async (db, tenantId) => {
    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
    if (!clip) return;
    if (clip.status !== "rendered" && clip.status !== "scheduled") return;
    if (!clip.renderedPath || clip.targets.length === 0) return;

    const [config] = await db.select().from(settings).limit(1);
    const timeZone = config?.timezone ?? DEFAULT_TIMEZONE;
    const now = new Date();
    const targets = clip.targets as PublishPlatform[];

    // Bestehende Posts des Clips: fehlende Plattformen übernehmen deren Zeit
    // (Konsistenz vor Kappe — das Video bleibt EIN Kalendereintrag).
    const existing = await db
      .select({ platform: posts.platform, scheduledAt: posts.scheduledAt })
      .from(posts)
      .where(eq(posts.clipId, clipId));
    const existingPlatforms = new Set(existing.map((post) => post.platform));
    const missing = targets.filter(
      (platform) => !existingPlatforms.has(platform),
    );
    if (missing.length === 0) {
      await db
        .update(clips)
        .set({ status: "scheduled", updatedAt: new Date() })
        .where(eq(clips.id, clipId));
      return;
    }

    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(inArray(socialAccounts.platform, missing));
    const accountFor = (platform: PublishPlatform) =>
      accounts.find((account) => account.platform === platform);

    // Nur ZUKÜNFTIGE Zeiten vererben — sonst würden Nachzügler eines teils
    // veröffentlichten Videos sofort fällig statt regulär eingeplant.
    let scheduledAt =
      existing.find(
        (post) => post.scheduledAt !== null && post.scheduledAt > now,
      )?.scheduledAt ?? null;

    if (!scheduledAt) {
      // Belegung je Ziel-Plattform (Zukunft + 24 h zurück für die Tageskappe).
      const platforms = [];
      for (const platform of missing) {
        const occupiedRows = await db
          .select({ scheduledAt: posts.scheduledAt })
          .from(posts)
          .where(
            and(
              eq(posts.platform, platform),
              isNotNull(posts.scheduledAt),
              ne(posts.status, "failed"),
              gte(
                posts.scheduledAt,
                new Date(now.getTime() - OCCUPANCY_WINDOW_MS),
              ),
            ),
          );
        platforms.push({
          platform,
          clipsPerDay:
            accountFor(platform)?.clipsPerDay ?? DEFAULT_CLIPS_PER_DAY,
          occupied: occupiedRows
            .map((row) => row.scheduledAt)
            .filter((d): d is Date => d !== null),
        });
      }
      scheduledAt = findNextCommonSlot({
        timeZone,
        timeSlots: commonTimeSlots(missing.map(accountFor)),
        now,
        platforms,
      });
    }

    let created = 0;
    for (const platform of missing) {
      const account = accountFor(platform);
      const connected = account?.status === "connected";
      await db
        .insert(posts)
        .values({
          tenantId,
          clipId,
          accountId: account?.id ?? null,
          platform,
          scheduledAt,
          status: connected ? "scheduled" : "awaiting_manual",
          error: connected
            ? null
            : "Plattform nicht verbunden — manuell veröffentlichen (Posts-Seite)",
        })
        .onConflictDoNothing();
      created += 1;
    }

    await db
      .update(clips)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(eq(clips.id, clipId));

    if (created > 0) {
      logger.info(
        { clipId, created, targets, scheduledAt },
        "schedule: Posts angelegt (ein gemeinsamer Slot)",
      );
    }
  });
}
