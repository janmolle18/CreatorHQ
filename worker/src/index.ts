import { Worker, type Job } from "bullmq";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  clips,
  posts,
  settings,
  socialAccounts,
  sourceVideos,
  withTenant,
  type DB,
} from "@creatorhq/db";
import {
  classificationReason,
  classifySource,
  decryptSecret,
  encryptSecret,
} from "@creatorhq/shared";
import { env } from "./env.ts";
import { logger } from "./logger.ts";
import {
  connection,
  QUEUE,
  queues,
  reiheEinmalEin,
  type ClipJob,
  type MandantenJob,
  type PostJob,
  type SourceVideoJob,
} from "./queues.ts";
import { autoPublishEnabled } from "./settings.ts";
import {
  imAuftragsMandanten,
  jeMandant,
  mandantAusAuftrag,
  MAX_JE_MANDANT_PRO_DURCHGANG,
} from "./tenant.ts";
import { ensureBucket } from "./integrations/storage.ts";
import { markSourceAsReference } from "./jobs/reference.ts";
import { getChannelUploads } from "./integrations/youtube.ts";
import { getRecentVods } from "./integrations/twitch.ts";
import { processDownload } from "./jobs/download.ts";
import { processValidateImport } from "./jobs/validate-import.ts";
import { processClip } from "./jobs/clip.ts";
import { processEnrich } from "./jobs/enrich.ts";
import { processRender, type RenderJob } from "./jobs/render.ts";
import { processSchedule } from "./jobs/schedule.ts";
import { processPublish } from "./jobs/publish.ts";
import { refreshIgToken } from "./integrations/instagram.ts";
import { processAnalytics } from "./jobs/analytics.ts";
import { processBriefing } from "./jobs/briefing.ts";
import { processBackup } from "./jobs/backup.ts";
import { processCleanup } from "./jobs/cleanup.ts";
import { syncAllComments } from "./integrations/comments.ts";
import { getRedis } from "./integrations/redis.ts";

await ensureBucket();

// Lange Lock-Dauer: Downloads können Minuten dauern → kein vorzeitiges "stalled".
const LONG = { lockDuration: 600_000, stalledInterval: 120_000, maxStalledCount: 2 };

// Ab wann ein „läuft gerade"-Zustand als steckengeblieben gilt. Großzügig
// gewählt: Ein echter Upload großer Videos darf dauern, aber nach dieser Zeit
// ohne jede Regung war es ein Absturz, kein langsamer Lauf.
const ZOMBIE_NACH_MS = 15 * 60 * 1000;

// ── Download-Queue: Quell-Downloads + Import-Validierung ──
const downloadWorker = new Worker(
  QUEUE.download,
  async (job: Job) => {
    switch (job.name) {
      case "download":
        return processDownload(job as Job<SourceVideoJob>);
      case "validate-import":
        return processValidateImport(job as Job<ClipJob>);
      default:
        logger.warn({ name: job.name }, "download-queue: unbekannter Job");
    }
  },
  { connection, concurrency: 2, ...LONG }
);

// ── Clip-Queue: Kandidaten finden (CPU-lastig) + Captions (API-leicht) ──
const clipWorker = new Worker(
  QUEUE.clip,
  async (job: Job) => {
    switch (job.name) {
      case "clip":
        return processClip(job as Job<SourceVideoJob>);
      case "enrich":
        return processEnrich(job as Job<ClipJob>);
      default:
        logger.warn({ name: job.name }, "clip-queue: unbekannter Job");
    }
  },
  { connection, concurrency: 1, ...LONG }
);

// ── Render-Queue: 9:16 + SRT-Burn-in (CPU-lastig) ──
const renderWorker = new Worker(
  QUEUE.render,
  async (job: Job) => processRender(job as Job<RenderJob>),
  { connection, concurrency: 1, ...LONG }
);

// ── Analytics-Queue: tägliche Snapshots ──
const analyticsWorker = new Worker(
  QUEUE.analytics,
  async (job: Job<MandantenJob>) => processAnalytics(job),
  { connection, concurrency: 1, ...LONG }
);

// ── Comments-Queue: Kommentar-Sync (YouTube keyless-fähig, IG verbunden) ──
const commentsWorker = new Worker(
  QUEUE.comments,
  async (job: Job<MandantenJob>) => syncAllComments(mandantAusAuftrag(job)),
  { connection, concurrency: 1, ...LONG }
);

// ── Briefing-Queue: tägliches Claude-Briefing (synct Kommentare zuerst) ──
const briefingWorker = new Worker(
  QUEUE.briefing,
  async (job: Job<MandantenJob>) => processBriefing(job),
  { connection, concurrency: 1, ...LONG }
);

// ── Publish-Queue: Plattform-Uploads (API-Rate-limitiert) ──
const publishWorker = new Worker(
  QUEUE.publish,
  async (job: Job) => processPublish(job as Job<PostJob>),
  { connection, concurrency: 2, ...LONG }
);

/**
 * Bestandszeile auf „Referenz“ umstellen — selbstheilend, damit auch Videos
 * korrigiert werden, die vor dieser Regel schon im System lagen. Laufende Jobs
 * (downloading/clipping) werden ausgespart.
 *
 * Bereits umgestellte Zeilen werden nur dann noch einmal angefasst, wenn ihre
 * Quelldatei noch im Speicher liegt — so räumt jeder Scan Reste auf, ohne bei
 * sauberen Zeilen Arbeit zu machen.
 */
async function markAsReference(
  db: DB,
  externalId: string,
  reason: string
): Promise<void> {
  const [existing] = await db
    .select({
      id: sourceVideos.id,
      status: sourceVideos.status,
      storagePath: sourceVideos.storagePath,
    })
    .from(sourceVideos)
    .where(
      and(
        eq(sourceVideos.platform, "youtube"),
        eq(sourceVideos.externalId, externalId),
        inArray(sourceVideos.status, [
          "discovered",
          "downloaded",
          "clipped",
          "failed",
          "reference",
        ])
      )
    );
  if (!existing) return;
  if (existing.status === "reference" && existing.storagePath === null) return;

  await markSourceAsReference(db, {
    sourceVideoId: existing.id,
    storagePath: existing.storagePath,
    reason,
  });
}

// ── Discovery: Kanal scannen und neue Videos als source_videos anlegen ──
async function scanChannel(
  db: DB,
  tenantId: string
): Promise<{ found: number; added: number }> {
  const [config] = await db.select().from(settings).limit(1);
  const identifier = config?.youtubeChannelId || env.pipeline.defaultYoutubeHandle;

  const videos = await getChannelUploads(identifier);
  let added = 0;
  let reference = 0;
  for (const video of videos) {
    // Fertige Shorts kommen gar nicht erst in die Download-Warteschlange —
    // sie werden nur gemessen, nie geschnitten.
    const isReference = classifySource(video) === "reference";
    if (isReference) reference += 1;

    const inserted = await db
      .insert(sourceVideos)
      .values({
        tenantId,
        sourceKind: "youtube_video",
        platform: "youtube",
        externalId: video.externalId,
        url: video.url,
        title: video.title,
        durationSeconds: video.durationSeconds ?? null,
        status: isReference ? "reference" : "discovered",
        error: isReference ? classificationReason(video) : null,
      })
      .onConflictDoNothing()
      .returning({ id: sourceVideos.id });
    if (inserted.length > 0) {
      added += 1;
      continue;
    }

    // Bestandszeile: Dauer nachtragen, sobald wir sie kennen. Den Status nur
    // aus „discovered“ heraus umstellen — bereits geschnittene Langvideos
    // dürfen sich davon nicht anfassen lassen.
    if (video.durationSeconds != null) {
      await db
        .update(sourceVideos)
        .set({ durationSeconds: video.durationSeconds, updatedAt: new Date() })
        .where(
          and(
            eq(sourceVideos.platform, "youtube"),
            eq(sourceVideos.externalId, video.externalId),
            isNull(sourceVideos.durationSeconds)
          )
        );
    }
    if (isReference) await markAsReference(db, video.externalId, classificationReason(video));
  }

  // Twitch-VODs (vorbereitet): nur wenn User-ID und App-Credentials existieren.
  if (config?.twitchUserId && env.twitch.clientId && env.twitch.clientSecret) {
    const vods = await getRecentVods(config.twitchUserId);
    for (const vod of vods) {
      const inserted = await db
        .insert(sourceVideos)
        .values({
          tenantId,
          sourceKind: "twitch_vod",
          platform: "twitch",
          externalId: vod.externalId,
          url: vod.url,
          title: vod.title,
          status: "discovered",
        })
        .onConflictDoNothing()
        .returning({ id: sourceVideos.id });
      if (inserted.length > 0) added += 1;
    }
  }

  logger.info(
    { tenantId, identifier, found: videos.length, added, reference },
    "scan-channel: fertig"
  );
  return { found: videos.length, added };
}

// ── Maintenance: wiederkehrende Trigger + On-Demand-Jobs aus dem Web ──
const maintenanceWorker = new Worker(
  QUEUE.maintenance,
  async (job: Job) => {
    switch (job.name) {
      // Von Hand aus dem Dashboard — gilt genau für den Mandanten, der klickt.
      case "scan-channel":
        return imAuftragsMandanten(job, (db, tenantId) => scanChannel(db, tenantId));

      case "discovery-tick":
        return jeMandant("discovery-tick", async (db, tenantId) => {
          const [config] = await db.select().from(settings).limit(1);
          // Der Schalter gehört dem Mandanten: Wer die Suche aus hat, wird
          // übersprungen, ohne die anderen aufzuhalten.
          if (!config?.autoDiscovery) return;
          await scanChannel(db, tenantId);
        });

      case "promote-approved":
        return jeMandant("promote-approved", async (db, tenantId) => {
          // Freigegebene Clips ins Rendering schieben (jobId dedupliziert).
          // Gedeckelt: Der Takt läuft alle 30 Sekunden und ist selbstheilend —
          // was jetzt nicht drankommt, kommt gleich dran. Ohne Deckel schöbe
          // ein Mandant mit fünfzig Freigaben fünfzig Aufträge auf einmal in
          // die Schlange, und der nächste Creator wartet dahinter.
          const approved = await db
            .select({ id: clips.id })
            .from(clips)
            .where(eq(clips.status, "approved"))
            .limit(MAX_JE_MANDANT_PRO_DURCHGANG);
          for (const clip of approved) {
            await reiheEinmalEin(
              queues.render,
              "render",
              { tenantId, clipId: clip.id },
              `render-${clip.id}`
            );
          }
          if (approved.length > 0) {
            logger.info({ tenantId, count: approved.length }, "promote-approved: eingereiht");
          }

          // Sweep: gerenderte Clips mit Zielen, aber ohne Posts → Scheduling.
          const unscheduled = await db
            .select({ id: clips.id })
            .from(clips)
            .where(and(eq(clips.status, "rendered"), sql`cardinality(${clips.targets}) > 0`))
            .limit(MAX_JE_MANDANT_PRO_DURCHGANG);
          for (const clip of unscheduled) {
            await reiheEinmalEin(
              queues.maintenance,
              "schedule",
              { tenantId, clipId: clip.id },
              `schedule-${clip.id}`
            );
          }
        });

      case "schedule":
        return processSchedule(job as Job<ClipJob>);

      // Fächert die Tagesläufe auf: ein Auftrag JE MANDANT statt einem großen.
      // So reißt ein Kunde mit kaputtem Konto die Messung der anderen nicht mit.
      case "analytics-tick":
        return jeMandant("analytics-tick", async (_db, tenantId) => {
          await reiheEinmalEin(
            queues.analytics,
            "daily-analytics",
            { tenantId },
            `analytics-${tenantId}-${new Date().toISOString().slice(0, 10)}`
          );
        });

      case "briefing-tick":
        return jeMandant("briefing-tick", async (_db, tenantId) => {
          await reiheEinmalEin(
            queues.briefing,
            "daily-briefing",
            { tenantId },
            `briefing-${tenantId}-${new Date().toISOString().slice(0, 10)}`
          );
        });

      // Plattformweit, nicht je Mandant: sichert die GESAMTE Datenbank.
      case "backup-daily":
        return processBackup();

      case "cleanup-daily":
        return jeMandant("cleanup-daily", (db) => processCleanup(db));

      case "refresh-ig-token":
        return jeMandant("refresh-ig-token", async (db, tenantId) => {
          // Wöchentlich: Long-lived-Token (60 Tage) proaktiv verlängern.
          const [ig] = await db
            .select()
            .from(socialAccounts)
            .where(eq(socialAccounts.platform, "instagram"));
          if (!ig?.accessTokenEnc || ig.status !== "connected") return;
          try {
            const tokens = await refreshIgToken(decryptSecret(ig.accessTokenEnc));
            const encrypted = encryptSecret(tokens.accessToken);
            await db
              .update(socialAccounts)
              .set({
                accessTokenEnc: encrypted,
                refreshTokenEnc: encrypted,
                tokenExpiresAt: tokens.expiresAt,
                lastError: null,
                updatedAt: new Date(),
              })
              .where(eq(socialAccounts.id, ig.id));
            logger.info({ tenantId, expiresAt: tokens.expiresAt }, "refresh-ig-token: verlängert");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await db
              .update(socialAccounts)
              .set({ status: "expired", lastError: message.slice(0, 300), updatedAt: new Date() })
              .where(eq(socialAccounts.id, ig.id));
            logger.warn(
              { tenantId, err: message },
              "refresh-ig-token: fehlgeschlagen — Konto auf abgelaufen gesetzt"
            );
          }
        });

      case "due-posts":
        return jeMandant("due-posts", async (db, tenantId) => {
          // Steckengebliebene Uploads einsammeln, bevor neue Arbeit kommt.
          //
          // Stirbt der Worker mitten im Upload (Neustart, Speichermangel),
          // bleibt der Post auf „uploading" stehen: Der Takt unten greift nur
          // „scheduled", und der BullMQ-Auftrag gilt als erledigt. Ohne dieses
          // Aufräumen hängt er dort für immer — unsichtbar, weil er auch
          // nirgends als gescheitert auftaucht.
          const zombies = await db
            .update(posts)
            .set({ status: "scheduled", updatedAt: new Date() })
            .where(
              and(
                eq(posts.status, "uploading"),
                lte(posts.updatedAt, new Date(Date.now() - ZOMBIE_NACH_MS))
              )
            )
            .returning({ id: posts.id });
          if (zombies.length > 0) {
            logger.warn(
              { tenantId, count: zombies.length },
              "due-posts: hängende Uploads zurückgestellt"
            );
          }

          // Hauptschalter — je Mandant. Wer ihn aus hat, arbeitet weiter über
          // den manuellen Weg; sichtbar auf /system, damit das kein stiller
          // Stillstand ist.
          if (!(await autoPublishEnabled(tenantId))) return;

          const due = await db
            .select({ id: posts.id })
            .from(posts)
            .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())))
            .limit(MAX_JE_MANDANT_PRO_DURCHGANG);
          for (const post of due) {
            await reiheEinmalEin(
              queues.publish,
              "publish",
              { tenantId, postId: post.id },
              `publish-${post.id}`
            );
          }
          if (due.length > 0) {
            logger.info({ tenantId, count: due.length }, "due-posts: eingereiht");
          }
        });

      case "ingest-tick":
        return jeMandant("ingest-tick", async (db, tenantId) => {
          // Selbstheilend: alles Entdeckte einreihen (jobId dedupliziert).
          const discovered = await db
            .select({ id: sourceVideos.id })
            .from(sourceVideos)
            .where(eq(sourceVideos.status, "discovered"))
            .limit(MAX_JE_MANDANT_PRO_DURCHGANG);
          for (const source of discovered) {
            await reiheEinmalEin(
              queues.download,
              "download",
              { tenantId, sourceVideoId: source.id },
              `download-${source.id}`
            );
          }

          // Geladene Quellen, die nie geschnitten wurden.
          //
          // `downloaded` ist ein Durchgangszustand: Der Download-Auftrag reiht
          // den Schnitt direkt hinterher. Reisst diese eine Verbindung, blieb
          // die Quelle ohne diesen Sweep für immer liegen — in DavidHQ lagen
          // genau so zwei Videos fünf Tage da, ohne Fehlermeldung.
          //
          // Keine Endlosschleife: Scheitert der Schnitt, setzt clip.ts die
          // Quelle auf `failed`, und sie fällt hier heraus.
          const ungeschnitten = await db
            .select({ id: sourceVideos.id })
            .from(sourceVideos)
            .where(eq(sourceVideos.status, "downloaded"))
            .limit(MAX_JE_MANDANT_PRO_DURCHGANG);
          for (const source of ungeschnitten) {
            await reiheEinmalEin(
              queues.clip,
              "clip",
              { tenantId, sourceVideoId: source.id },
              `clip-${source.id}`
            );
          }

          // Importierte Clips ohne ffprobe-Daten validieren.
          const unvalidated = await db
            .select({ id: clips.id })
            .from(clips)
            .where(and(eq(clips.origin, "imported"), isNull(clips.endSeconds)))
            .limit(MAX_JE_MANDANT_PRO_DURCHGANG);
          for (const clip of unvalidated) {
            await reiheEinmalEin(
              queues.download,
              "validate-import",
              { tenantId, clipId: clip.id },
              `validate-${clip.id}`
            );
          }

          if (discovered.length + ungeschnitten.length + unvalidated.length > 0) {
            logger.info(
              {
                tenantId,
                downloads: discovered.length,
                schnitte: ungeschnitten.length,
                validations: unvalidated.length,
              },
              "ingest-tick: eingereiht"
            );
          }
        });

      default:
        logger.warn({ name: job.name }, "maintenance: unbekannter Job");
    }
  },
  { connection, concurrency: 1, ...LONG }
);

const workers = [
  downloadWorker,
  clipWorker,
  renderWorker,
  publishWorker,
  analyticsWorker,
  commentsWorker,
  briefingWorker,
  maintenanceWorker,
];
for (const worker of workers) {
  worker.on("failed", (job, err) =>
    logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, "Job fehlgeschlagen")
  );
  // 'error' abfangen, damit BullMQ-Interna (Lock/Redis) den Prozess nicht crashen
  worker.on("error", (err) =>
    logger.warn({ queue: worker.name, err: err.message }, "Worker-Fehler (ignoriert)")
  );
}

// Repeatables registrieren (idempotent): Ingest-Sweep, Render-Promotion,
// fällige Posts, Discovery.
await queues.maintenance.add("ingest-tick", {}, { repeat: { every: 15_000 } });
await queues.maintenance.add("promote-approved", {}, { repeat: { every: 30_000 } });
await queues.maintenance.add("due-posts", {}, { repeat: { every: 60_000 } });
await queues.maintenance.add(
  "refresh-ig-token",
  {},
  { repeat: { pattern: "0 4 * * 1", tz: "Europe/Berlin" } } // montags 04:00
);
// Die Tagesläufe hängen nicht mehr direkt am Takt: Der Fächer-Auftrag legt je
// Mandant einen eigenen an. Ein Kunde mit kaputtem Konto reißt die Messung der
// anderen damit nicht mit.
await queues.maintenance.add(
  "analytics-tick",
  {},
  { repeat: { pattern: "30 5 * * *", tz: "Europe/Berlin" } } // täglich 05:30
);
await queues.maintenance.add(
  "briefing-tick",
  {},
  { repeat: { pattern: "0 6 * * *", tz: "Europe/Berlin" } } // täglich 06:00, nach der Messung
);
await queues.maintenance.add(
  "discovery-tick",
  {},
  { repeat: { pattern: env.pipeline.discoveryCron, tz: "Europe/Berlin" } }
);
await queues.maintenance.add(
  "backup-daily",
  {},
  { repeat: { pattern: "30 3 * * *", tz: "Europe/Berlin" } } // täglich 03:30, vor Analytics
);
await queues.maintenance.add(
  "cleanup-daily",
  {},
  { repeat: { pattern: "45 4 * * *", tz: "Europe/Berlin" } }
);

logger.info("CreatorHQ Worker läuft — download + clip + render + publish + maintenance aktiv");

// ── Heartbeat für die Dashboard-Übersicht (EX 45 s → 3 verpasste Ticks = rot) ──
const HEARTBEAT_KEY = "creatorhq:worker:heartbeat";
const writeHeartbeat = () => {
  getRedis()
    .set(HEARTBEAT_KEY, new Date().toISOString(), "EX", 45)
    .catch(() => {});
};
writeHeartbeat();
const heartbeatTimer = setInterval(writeHeartbeat, 15_000);

// ── Graceful shutdown ──
async function shutdown() {
  logger.info("Worker fährt herunter …");
  clearInterval(heartbeatTimer);
  await getRedis().del(HEARTBEAT_KEY).catch(() => {});
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
