import {
  metricsSnapshots,
  posts,
  settings,
  socialAccounts,
  sourceVideos,
  type SocialAccount,
  type DB,
} from "@creatorhq/db";
import {
  chunkIds,
  DEFAULT_TIMEZONE,
  todayInTz,
  type PublishPlatform,
} from "@creatorhq/shared";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { execa } from "execa";
import { env } from "../env.ts";
import type { Job } from "bullmq";
import { logger } from "../logger.ts";
import { imAuftragsMandanten } from "../tenant.ts";
import type { MandantenJob } from "../queues.ts";
import { fetchWithRetry } from "../integrations/http.ts";
import {
  normalizeIgAccount,
  normalizeIgMediaInsights,
  normalizeTiktokVideo,
  normalizeYoutubeChannelStats,
  normalizeYoutubeVideoStats,
  normalizeYtdlpChannel,
  type SnapshotMetrics,
} from "../integrations/metrics.ts";
import { withFreshToken } from "../integrations/tokens.ts";

// NEU (ClipPilots analytics war nur ein Stub): täglicher Snapshot je Plattform.
// Datenquellen in Reihenfolge der Qualität — OAuth-APIs, API-Key, yt-dlp-Fallback.
// Upsert auf (snapshotDate, accountId, postId) NULLS NOT DISTINCT → idempotent.

const YT_API = "https://www.googleapis.com/youtube/v3";
const IG_GRAPH = "https://graph.instagram.com";

async function getOrCreateAccount(
  db: DB,
  tenantId: string,
  platform: PublishPlatform,
): Promise<SocialAccount> {
  const [existing] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, platform));
  if (existing) return existing;
  await db
    .insert(socialAccounts)
    .values({ tenantId, platform })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, platform));
  return created!;
}

async function upsertSnapshot(
  db: DB,
  tenantId: string,
  input: {
    snapshotDate: string;
    platform: PublishPlatform;
    accountId: string;
    postId: string | null;
    /** Gesetzt für eigene Kanal-Videos (Referenz-Messung statt Post-Messung). */
    sourceVideoId?: string | null;
    metrics: SnapshotMetrics;
  },
): Promise<void> {
  if (Object.keys(input.metrics).length === 0) return;
  await db
    .insert(metricsSnapshots)
    .values({
      tenantId,
      snapshotDate: input.snapshotDate,
      platform: input.platform,
      accountId: input.accountId,
      postId: input.postId,
      sourceVideoId: input.sourceVideoId ?? null,
      metrics: input.metrics,
      capturedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        metricsSnapshots.snapshotDate,
        metricsSnapshots.accountId,
        metricsSnapshots.postId,
        metricsSnapshots.sourceVideoId,
      ],
      set: { metrics: input.metrics, capturedAt: new Date() },
    });
}

/**
 * Statistiken zu Video-IDs. Zwingend blockweise: mehr als 50 IDs beantwortet
 * die videos-API mit HTTP 400 — vorher wäre der ganze Lauf ab dem 51. Video
 * stillschweigend gescheitert.
 */
async function fetchYoutubeStats(
  ids: readonly string[],
  authHeader: Record<string, string> | null,
  keyParam: string,
): Promise<Map<string, Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const batch of chunkIds(ids)) {
    if (batch.length === 0) continue;
    const res = await fetchWithRetry(
      `${YT_API}/videos?part=statistics&id=${batch.join(",")}${keyParam}`,
      authHeader ? { headers: authHeader } : {},
    );
    const data = (await res.json()) as {
      items?: Array<{ id: string; statistics?: Record<string, unknown> }>;
    };
    for (const item of data.items ?? [])
      byId.set(item.id, item.statistics ?? {});
  }
  return byId;
}

/** Veröffentlichte/übergebene Posts einer Plattform mit externer ID. */
async function postsWithExternalId(db: DB, platform: PublishPlatform) {
  return db
    .select({ id: posts.id, externalPostId: posts.externalPostId })
    .from(posts)
    .where(
      and(
        eq(posts.platform, platform),
        isNotNull(posts.externalPostId),
        inArray(posts.status, ["posted", "published"]),
      ),
    );
}

// ── YouTube: OAuth → API-Key → yt-dlp (keyless, echte Kanalzahlen) ──
async function collectYoutube(
  db: DB,
  tenantId: string,
  snapshotDate: string,
): Promise<number> {
  const [config] = await db.select().from(settings).limit(1);
  const identifier =
    config?.youtubeChannelId || env.pipeline.defaultYoutubeHandle;
  const [connected] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, "youtube"));

  let channelMetrics: SnapshotMetrics = {};
  let authHeader: Record<string, string> | null = null;
  let written = 0;

  if (connected?.status === "connected") {
    const token = await withFreshToken(connected.id);
    authHeader = { Authorization: `Bearer ${token}` };
    const res = await fetchWithRetry(
      `${YT_API}/channels?part=statistics&mine=true`,
      {
        headers: authHeader,
      },
    );
    const data = (await res.json()) as {
      items?: Array<{ statistics?: Record<string, unknown> }>;
    };
    channelMetrics = normalizeYoutubeChannelStats(
      data.items?.[0]?.statistics ?? {},
    );
  } else if (env.youtube.apiKey) {
    const query = identifier.startsWith("UC")
      ? `id=${identifier}`
      : `forHandle=${encodeURIComponent(identifier.replace(/^@/, ""))}`;
    const res = await fetchWithRetry(
      `${YT_API}/channels?part=statistics&${query}&key=${env.youtube.apiKey}`,
    );
    const data = (await res.json()) as {
      items?: Array<{ statistics?: Record<string, unknown> }>;
    };
    channelMetrics = normalizeYoutubeChannelStats(
      data.items?.[0]?.statistics ?? {},
    );
  } else {
    // Keyless: yt-dlp liest Follower + View-Counts des Videos-Tabs.
    const channelUrl = identifier.startsWith("UC")
      ? `https://www.youtube.com/channel/${identifier}/videos`
      : `https://www.youtube.com/${identifier}/videos`;
    const { stdout } = await execa(env.paths.ytdlp, [
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      channelUrl,
    ]);
    channelMetrics = normalizeYtdlpChannel(JSON.parse(stdout));
  }

  const account = await getOrCreateAccount(db, tenantId, "youtube");
  await upsertSnapshot(db, tenantId, {
    snapshotDate,
    platform: "youtube",
    accountId: account.id,
    postId: null,
    metrics: channelMetrics,
  });
  if (Object.keys(channelMetrics).length > 0) written += 1;

  // Post-Ebene: braucht API-Key oder OAuth (videos?part=statistics).
  const keyParam = env.youtube.apiKey ? `&key=${env.youtube.apiKey}` : "";
  if (authHeader || env.youtube.apiKey) {
    const published = await postsWithExternalId(db, "youtube");
    if (published.length > 0) {
      const byId = await fetchYoutubeStats(
        published.map((post) => post.externalPostId!),
        authHeader,
        keyParam,
      );
      for (const post of published) {
        const stats = byId.get(post.externalPostId!);
        if (!stats) continue;
        await upsertSnapshot(db, tenantId, {
          snapshotDate,
          platform: "youtube",
          accountId: account.id,
          postId: post.id,
          metrics: normalizeYoutubeVideoStats(stats),
        });
        written += 1;
      }
    }

    // Referenz-Messung: Davids eigene Kanal-Videos — vor allem seine fertigen
    // Shorts, die nie durch CreatorHQ liefen. Daraus lernt das Briefing, welche
    // Formate funktionieren. Ein Aufruf je 50 Videos, 1 Quota-Unit.
    const channelVideos = await db
      .select({ id: sourceVideos.id, externalId: sourceVideos.externalId })
      .from(sourceVideos)
      .where(eq(sourceVideos.platform, "youtube"));
    if (channelVideos.length > 0) {
      const byId = await fetchYoutubeStats(
        channelVideos.map((video) => video.externalId),
        authHeader,
        keyParam,
      );
      for (const video of channelVideos) {
        const stats = byId.get(video.externalId);
        if (!stats) continue;
        await upsertSnapshot(db, tenantId, {
          snapshotDate,
          platform: "youtube",
          accountId: account.id,
          postId: null,
          sourceVideoId: video.id,
          metrics: normalizeYoutubeVideoStats(stats),
        });
        written += 1;
      }
      logger.info(
        { videos: channelVideos.length },
        "analytics: Kanal-Videos gemessen",
      );
    }
  }
  return written;
}

// ── Instagram: nur mit verbundenem Account ──
async function collectInstagram(
  db: DB,
  tenantId: string,
  snapshotDate: string,
): Promise<number> {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, "instagram"));
  if (account?.status !== "connected") {
    logger.info("analytics: Instagram übersprungen (nicht verbunden)");
    return 0;
  }
  const token = await withFreshToken(account.id);
  let written = 0;

  const meRes = await fetchWithRetry(
    `${IG_GRAPH}/me?fields=followers_count&access_token=${token}`,
  );
  const me = (await meRes.json()) as Record<string, unknown>;
  await upsertSnapshot(db, tenantId, {
    snapshotDate,
    platform: "instagram",
    accountId: account.id,
    postId: null,
    metrics: normalizeIgAccount(me),
  });
  written += 1;

  for (const post of await postsWithExternalId(db, "instagram")) {
    try {
      const res = await fetchWithRetry(
        `${IG_GRAPH}/${post.externalPostId}/insights?metric=views,reach,likes,comments,shares,saved&access_token=${token}`,
      );
      const data = (await res.json()) as {
        data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
      };
      await upsertSnapshot(db, tenantId, {
        snapshotDate,
        platform: "instagram",
        accountId: account.id,
        postId: post.id,
        metrics: normalizeIgMediaInsights(data),
      });
      written += 1;
    } catch (error) {
      logger.warn(
        { postId: post.id, err: String(error) },
        "analytics: IG-Insights-Fehler",
      );
    }
  }
  return written;
}

// ── TikTok: video.list mit verbundenem Account ──
async function collectTiktok(
  db: DB,
  tenantId: string,
  snapshotDate: string,
): Promise<number> {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, "tiktok"));
  if (account?.status !== "connected") {
    logger.info("analytics: TikTok übersprungen (nicht verbunden)");
    return 0;
  }
  const token = await withFreshToken(account.id);
  const res = await fetchWithRetry(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,view_count,like_count,comment_count,share_count",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ max_count: 20 }),
    },
  );
  const data = (await res.json()) as {
    data?: { videos?: Array<Record<string, unknown> & { id?: string }> };
  };
  const videos = data.data?.videos ?? [];
  const byId = new Map(videos.map((v) => [String(v.id ?? ""), v]));

  let written = 0;
  for (const post of await postsWithExternalId(db, "tiktok")) {
    const video = byId.get(post.externalPostId!);
    if (!video) continue;
    await upsertSnapshot(db, tenantId, {
      snapshotDate,
      platform: "tiktok",
      accountId: account.id,
      postId: post.id,
      metrics: normalizeTiktokVideo(video),
    });
    written += 1;
  }
  return written;
}

export async function processAnalytics(job: Job<MandantenJob>): Promise<void> {
  await imAuftragsMandanten(job, async (db, tenantId) => {
    const [config] = await db.select().from(settings).limit(1);
    const snapshotDate = todayInTz(config?.timezone ?? DEFAULT_TIMEZONE);

    let total = 0;
    for (const [name, collector] of [
      ["youtube", collectYoutube],
      ["instagram", collectInstagram],
      ["tiktok", collectTiktok],
    ] as const) {
      try {
        total += await collector(db, tenantId, snapshotDate);
      } catch (error) {
        logger.warn(
          { platform: name, err: String(error) },
          "analytics: Plattform fehlgeschlagen",
        );
      }
    }
    logger.info(
      { tenantId, snapshotDate, total },
      "analytics: Snapshots geschrieben",
    );
  });
}
