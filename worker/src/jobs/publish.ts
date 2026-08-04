import {
  clips,
  posts,
  settings,
  socialAccounts,
  type Post,
  type DB,
} from "@creatorhq/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Job } from "bullmq";
import { execa } from "execa";
import { rm } from "node:fs/promises";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import type { PostJob } from "../queues.ts";
import { autoPublishEnabled } from "../settings.ts";
import { TokenExpiredError } from "../integrations/errors.ts";
import {
  createReelContainer,
  fetchPermalink,
  publishContainer,
  waitForContainer,
} from "../integrations/instagram.ts";
import {
  getPublicMediaUrl,
  isPublicMediaAvailable,
} from "../integrations/publicMedia.ts";
import { downloadKeyToTmp } from "../integrations/storage.ts";
import { uploadVideo as uploadTiktokVideo } from "../integrations/tiktok.ts";
import { withFreshToken } from "../integrations/tokens.ts";
import { imAuftragsMandanten } from "../tenant.ts";
import {
  buildVideoMetadata,
  uploadVideo as uploadYoutubeVideo,
} from "../integrations/youtube-upload.ts";

// Reels: 3 s bis 15 min, 9:16 (mit Toleranz).
const REEL_MIN_SECONDS = 3;
const REEL_MAX_SECONDS = 15 * 60;
const TARGET_ASPECT = 9 / 16;
const ASPECT_TOLERANCE = 0.02;

/** ffprobe-Validierung vor dem IG-Publish (Dauer + Seitenverhältnis). */
async function validateForReel(localPath: string): Promise<string | null> {
  const { stdout } = await execa("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    localPath,
  ]);
  const probe = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const width = probe.streams?.[0]?.width ?? 0;
  const height = probe.streams?.[0]?.height ?? 0;
  const duration = parseFloat(probe.format?.duration ?? "0") || 0;

  if (duration < REEL_MIN_SECONDS || duration > REEL_MAX_SECONDS) {
    return `Dauer ${Math.round(duration)} s außerhalb 3 s – 15 min`;
  }
  if (
    width <= 0 ||
    height <= 0 ||
    Math.abs(width / height - TARGET_ASPECT) > ASPECT_TOLERANCE
  ) {
    return `Kein 9:16-Format (${width}x${height}) — erst neu rendern`;
  }
  return null;
}

// NEU (statt ClipPilots post.ts): Dispatch nach Plattform, Token-Handling mit
// Redis-Lock, sauberer Manual-Fallback — ein fehlender Key blockiert nie.

function buildCaption(caption: string | null, hashtags: string[]): string {
  const tags = hashtags.join(" ");
  return [caption ?? "", tags].filter(Boolean).join("\n\n").trim();
}

async function fallbackToManual(
  db: DB,
  postId: string,
  reason: string,
): Promise<void> {
  await db
    .update(posts)
    .set({
      status: "awaiting_manual",
      error: reason.slice(0, 300),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));
}

/**
 * Das verbundene Konto der Plattform — bewusst NICHT `post.accountId`.
 *
 * Die Planung schreibt in `accountId` die ID des Kontos, das es zum
 * Planungszeitpunkt gab; existierte damals keins, bleibt die Spalte leer
 * (`worker/src/jobs/schedule.ts`). Solche Posts blieben auch NACH dem Verbinden
 * dauerhaft im Handbetrieb, ohne dass irgendwo ein Fehler sichtbar wird.
 *
 * Da (tenant_id, platform) eindeutig ist, gibt es je Mandant und Plattform
 * genau ein Konto — die Auflösung über die Plattform ist deshalb immer richtig und
 * heilt Altbestand von selbst. Die gefundene ID wird zurückgeschrieben, damit
 * die Spalte mit der Zeit stimmt.
 */
async function verbundenesKonto(
  db: DB,
  post: Post,
): Promise<string | null> {
  const [konto] = await db
    .select({ id: socialAccounts.id, status: socialAccounts.status })
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, post.platform));

  if (!konto || konto.status !== "connected") return null;

  if (post.accountId !== konto.id) {
    await db
      .update(posts)
      .set({ accountId: konto.id, updatedAt: new Date() })
      .where(eq(posts.id, post.id));
  }
  return konto.id;
}

async function publishTiktok(
  db: DB,
  post: Post,
  caption: string,
): Promise<void> {
  if (!env.tiktok.clientKey || !env.tiktok.clientSecret) {
    await fallbackToManual(
      db,
      post.id,
      "TikTok ist noch nicht eingerichtet — bitte selbst posten",
    );
    return;
  }
  const accountId = await verbundenesKonto(db, post);
  if (!accountId) {
    await fallbackToManual(db, post.id, "Kein TikTok-Account verbunden");
    return;
  }

  const [clip] = await db.select().from(clips).where(eq(clips.id, post.clipId));
  if (!clip?.renderedPath) throw new Error("Clip-Datei fehlt");

  let localPath: string | null = null;
  try {
    const accessToken = await withFreshToken(db, accountId);
    localPath = await downloadKeyToTmp(
      clip.renderedPath,
      `publish-${post.id}.mp4`,
    );
    const { publishId } = await uploadTiktokVideo({
      accessToken,
      filePath: localPath,
      caption,
    });
    await db
      .update(posts)
      .set({
        // Inbox-Modus: an TikTok übergeben, David postet mit 2 Taps aus der Inbox.
        status: "posted",
        postedAt: new Date(),
        externalPostId: publishId,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id));
    logger.info({ postId: post.id, publishId }, "publish: TikTok übergeben");
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      await fallbackToManual(
        db,
        post.id,
        "TikTok-Verbindung abgelaufen — unter Accounts neu verbinden, dann manuell posten",
      );
      return;
    }
    throw error;
  } finally {
    if (localPath) await rm(localPath, { force: true });
  }
}

async function publishYoutube(db: DB, post: Post): Promise<void> {
  if (!env.google.clientId || !env.google.clientSecret) {
    await fallbackToManual(
      db,
      post.id,
      "YouTube ist noch nicht eingerichtet — bitte selbst posten",
    );
    return;
  }
  const accountId = await verbundenesKonto(db, post);
  if (!accountId) {
    await fallbackToManual(db, post.id, "Kein YouTube-Account verbunden");
    return;
  }

  const [clip] = await db.select().from(clips).where(eq(clips.id, post.clipId));
  if (!clip?.renderedPath) throw new Error("Clip-Datei fehlt");
  const [config] = await db.select().from(settings).limit(1);

  let localPath: string | null = null;
  try {
    const accessToken = await withFreshToken(db, accountId);
    localPath = await downloadKeyToTmp(
      clip.renderedPath,
      `publish-${post.id}.mp4`,
    );
    const metadata = buildVideoMetadata({
      title: clip.title,
      caption: post.captionOverride ?? clip.caption,
      hashtags: clip.hashtags,
      creatorName: config?.creatorName,
    });
    const { videoId } = await uploadYoutubeVideo({
      accessToken,
      filePath: localPath,
      metadata,
    });

    const isPrivateUntilAudit = env.google.uploadPrivacy !== "public";
    await db
      .update(posts)
      .set({
        // Bis zum bestandenen API-Audit lädt die API nur privat hoch →
        // Veröffentlichung passiert manuell in YouTube Studio.
        status: isPrivateUntilAudit ? "awaiting_manual" : "published",
        postedAt: new Date(),
        externalPostId: videoId,
        externalUrl: isPrivateUntilAudit
          ? `https://studio.youtube.com/video/${videoId}/edit`
          : `https://youtu.be/${videoId}`,
        error: isPrivateUntilAudit
          ? "Privat hochgeladen — in YouTube Studio auf „Öffentlich“ stellen (Link rechts)"
          : null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id));
    logger.info({ postId: post.id, videoId }, "publish: YouTube hochgeladen");
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      await fallbackToManual(
        db,
        post.id,
        "YouTube-Verbindung abgelaufen — unter Accounts neu verbinden, dann manuell posten",
      );
      return;
    }
    throw error;
  } finally {
    if (localPath) await rm(localPath, { force: true });
  }
}

async function publishInstagram(
  db: DB,
  post: Post,
  caption: string,
): Promise<void> {
  if (!env.instagram.appId || !env.instagram.appSecret) {
    await fallbackToManual(
      db,
      post.id,
      "Instagram ist noch nicht eingerichtet — bitte selbst posten",
    );
    return;
  }
  const accountId = await verbundenesKonto(db, post);
  if (!accountId) {
    await fallbackToManual(db, post.id, "Kein Instagram-Account verbunden");
    return;
  }
  if (!isPublicMediaAvailable()) {
    await fallbackToManual(
      db,
      post.id,
      "Instagram braucht noch eine feste Adresse von Jan — bitte selbst posten",
    );
    return;
  }

  const [clip] = await db.select().from(clips).where(eq(clips.id, post.clipId));
  if (!clip?.renderedPath) throw new Error("Clip-Datei fehlt");

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId));
  const igUserId = account?.authMeta?.igUserId;
  if (!igUserId) {
    await fallbackToManual(
      db,
      post.id,
      "Instagram-User-ID fehlt — Account neu verbinden",
    );
    return;
  }

  let localPath: string | null = null;
  try {
    // ffprobe-Validierung VOR dem Publish (Reel-Regeln).
    localPath = await downloadKeyToTmp(
      clip.renderedPath,
      `publish-${post.id}.mp4`,
    );
    const validationError = await validateForReel(localPath);
    if (validationError) {
      await fallbackToManual(
        db,
        post.id,
        `Reel-Validierung: ${validationError}`,
      );
      return;
    }

    const accessToken = await withFreshToken(db, accountId);
    const videoUrl = getPublicMediaUrl(clip.renderedPath);
    const containerId = await createReelContainer({
      igUserId,
      accessToken,
      videoUrl,
      caption,
    });
    await waitForContainer(containerId, accessToken);
    const mediaId = await publishContainer({
      igUserId,
      accessToken,
      containerId,
    });
    const permalink = await fetchPermalink(mediaId, accessToken);

    await db
      .update(posts)
      .set({
        status: "published",
        postedAt: new Date(),
        externalPostId: mediaId,
        externalUrl: permalink,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id));
    logger.info(
      { postId: post.id, mediaId },
      "publish: Instagram-Reel veröffentlicht",
    );
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      await fallbackToManual(
        db,
        post.id,
        "Instagram-Verbindung abgelaufen — unter Accounts neu verbinden, dann manuell posten",
      );
      return;
    }
    throw error;
  } finally {
    if (localPath) await rm(localPath, { force: true });
  }
}

export async function processPublish(job: Job<PostJob>): Promise<void> {
  const { postId, manual } = job.data;
  await imAuftragsMandanten(job, async (db, tenantId) => {
    // Zweite Sperre hinter dem Tick: Ein Job, der vor dem Ausschalten in die
    // Queue kam, darf danach nicht doch noch hochladen. Von Hand ausgelöste
    // Jobs sind ausgenommen — dort hat ein Mensch bewusst geklickt.
    if (!manual && !(await autoPublishEnabled(tenantId))) {
      logger.info(
        { postId },
        "publish: übersprungen — automatisches Posten ist aus",
      );
      return;
    }

    // Atomarer Anspruch statt Lesen → Prüfen → Schreiben.
    //
    // Vorher konnten zwei Jobs denselben Post greifen: der Minuten-Tick und
    // „Jetzt posten" reihen unter verschiedenen Job-IDs ein, die Queue läuft mit
    // Nebenläufigkeit 2 — beide lasen „scheduled", bevor einer „uploading"
    // schrieb, und dasselbe Video ging doppelt raus.
    //
    // `uploading` ist bewusst mit im WHERE: Stirbt der Worker mitten im Upload,
    // liefert BullMQ den Job erneut aus. Ein Guard, der nur „scheduled" gelten
    // lässt, hätte den Job dann als *erfolgreich* beendet und den Post für immer
    // in „wird hochgeladen" stehen lassen — kein Sweep holt ihn dort heraus.
    const [post] = await db
      .update(posts)
      .set({
        status: "uploading",
        attemptCount: sql`${posts.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(posts.id, postId),
          inArray(posts.status, ["scheduled", "uploading"]),
        ),
      )
      .returning();

    if (!post) {
      logger.info(
        { postId },
        "publish: übersprungen — ein anderer Lauf war schneller",
      );
      return;
    }

    // Bereits auf der Plattform? Dann war der Upload vor dem Absturz erfolgreich —
    // ein zweiter Versuch würde ein Duplikat erzeugen.
    if (post.externalPostId) {
      logger.warn(
        { postId, externalPostId: post.externalPostId },
        "publish: schon hochgeladen — kein zweiter Versuch",
      );
      await fallbackToManual(
        db,
        postId,
        "War bereits hochgeladen, als der Vorgang abbrach — bitte auf der Plattform nachsehen",
      );
      return;
    }

    const [clip] = await db
      .select()
      .from(clips)
      .where(eq(clips.id, post.clipId));
    const caption = buildCaption(
      post.captionOverride ?? clip?.caption ?? null,
      clip?.hashtags ?? [],
    );

    try {
      switch (post.platform) {
        case "tiktok":
          await publishTiktok(db, post, caption);
          break;
        case "youtube":
          await publishYoutube(db, post);
          break;
        case "instagram":
          await publishInstagram(db, post, caption);
          break;
        default:
          await fallbackToManual(
            db,
            postId,
            `Unbekannte Plattform ${post.platform}`,
          );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 300) : String(error);
      logger.error({ err: error, postId }, "publish: fehlgeschlagen");
      await db
        .update(posts)
        .set({
          // Nach 3 Versuchen bleibt der Post via Fallback abwickelbar.
          // `post` kommt aus dem RETURNING nach der Erhöhung — der Zähler steht
          // hier also schon auf dem Wert DIESES Versuchs, kein +1 mehr.
          status: post.attemptCount >= 3 ? "awaiting_manual" : "scheduled",
          error: message,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId));
      throw error;
    }

    // Verbindungs-Hinweis am Account pflegen, falls vorhanden.
    if (post.accountId) {
      await db
        .update(socialAccounts)
        .set({ updatedAt: new Date() })
        .where(eq(socialAccounts.id, post.accountId));
    }
  });
}
