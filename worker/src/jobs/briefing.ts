import {
  briefings,
  comments,
  db,
  ideas,
  metricsSnapshots,
  posts,
  settings,
  sourceVideos,
} from "@creatorhq/db";
import { DEFAULT_TIMEZONE, todayInTz } from "@creatorhq/shared";
import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import { syncAllComments } from "../integrations/comments.ts";
import {
  buildInputDigest,
  type DigestComment,
  type DigestVideoPerformance,
} from "./briefing-digest.ts";
import { parseBriefingJson } from "./briefing-schema.ts";

// Tägliches KI-Briefing: Kommentare + Trends + Planungsstand → Claude
// (BRIEFING_MODEL) → drei Sektionen (Video-Ideen, Antwort-Kandidaten,
// Brand-Empfehlungen). 1 Retry, sonst failed mit Rohtext — nie Müll in der DB.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = `Du bist der Content-Stratege eines deutschen YouTube-Creators, der über Clips auf TikTok, Instagram Reels und YouTube Shorts wachsen will. Du bekommst einen JSON-Digest (Kommentare mit IDs, 7-Tage-Trends, videoPerformance = seine eigenen Kanal-Videos mit aktuellen Zahlen, Posting-Frequenz, geplante Posts, offene Ideen). Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"summaryMd": string, "contentIdeas": [{"title", "description", "targetPlatforms"?: string[]}], "replyCandidates": [{"commentId", "whyWorthIt", "replySketch"}], "brandRecommendations": [{"area", "finding", "action"}]}
Regeln: Deutsch, konkret, keine Emojis. Werte videoPerformance aus, wenn vorhanden: benenne, welche Formate/Themen/Längen messbar besser laufen, und leite daraus die Ideen ab. Vergleiche Shorts NIE mit Langformat-Videos — die Views zählen unterschiedlich; vergleiche nur innerhalb einer Gruppe. summaryMd = 3-6 Sätze Lagebild in Markdown. 1-8 contentIdeas (umsetzbar als Kurzvideo). replyCandidates NUR mit commentId-Werten aus dem Digest — Kommentare wählen, die sich für ein Antwort-Video lohnen (max 5, leer erlaubt). 1-6 brandRecommendations zu Frequenz, Formaten, Bio, Cross-Links oder Nische. targetPlatforms nur aus: youtube, instagram, tiktok.`;

async function gatherDigest(creatorName: string): Promise<Record<string, unknown>> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
  const commentRows = await db
    .select()
    .from(comments)
    .orderBy(desc(comments.publishedAt))
    .limit(50);

  const videoTitleRows = await db
    .select({
      id: sourceVideos.id,
      externalId: sourceVideos.externalId,
      title: sourceVideos.title,
      durationSeconds: sourceVideos.durationSeconds,
    })
    .from(sourceVideos)
    .where(eq(sourceVideos.platform, "youtube"));
  const titleByVideo = new Map(videoTitleRows.map((v) => [v.externalId, v.title]));

  const digestComments: DigestComment[] = commentRows
    .filter((row) => !row.publishedAt || row.publishedAt >= sixtyDaysAgo)
    .map((row) => ({
      id: row.externalCommentId,
      videoId: row.externalVideoId,
      videoTitle: titleByVideo.get(row.externalVideoId) ?? null,
      author: row.author,
      text: row.text,
      likes: row.likeCount,
    }));

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const snapshotRows = await db
    .select()
    .from(metricsSnapshots)
    .where(
      and(
        isNull(metricsSnapshots.postId),
        // Ohne diese Zeile würden die Referenz-Messungen einzelner Videos als
        // Kanal-Zahlen mitgezählt.
        isNull(metricsSnapshots.sourceVideoId),
        gte(metricsSnapshots.snapshotDate, sevenDaysAgoIso)
      )
    );

  // Referenz-Messung: jüngster Stand je Kanal-Video (auch Davids fertige
  // Shorts, die nie durch CreatorHQ liefen) — die Lernquelle „was funktioniert“.
  const performanceRows = await db
    .select({
      sourceVideoId: metricsSnapshots.sourceVideoId,
      snapshotDate: metricsSnapshots.snapshotDate,
      metrics: metricsSnapshots.metrics,
    })
    .from(metricsSnapshots)
    .where(isNotNull(metricsSnapshots.sourceVideoId))
    .orderBy(metricsSnapshots.snapshotDate);
  const latestByVideo = new Map<string, Record<string, number>>();
  for (const row of performanceRows) {
    if (row.sourceVideoId) latestByVideo.set(row.sourceVideoId, row.metrics);
  }
  const videoPerformance: DigestVideoPerformance[] = videoTitleRows
    .map((video) => ({ video, metrics: latestByVideo.get(video.id) }))
    .filter((entry) => entry.metrics !== undefined)
    .map(({ video, metrics }) => ({
      title: video.title,
      durationSeconds: video.durationSeconds,
      views: metrics!.views ?? 0,
      likes: metrics!.likes,
      comments: metrics!.comments,
    }));

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const publishedRows = await db
    .select({ platform: posts.platform })
    .from(posts)
    .where(and(inArray(posts.status, ["posted", "published"]), gte(posts.postedAt, sevenDaysAgo)));
  const publishedCounts = new Map<string, number>();
  for (const row of publishedRows) {
    publishedCounts.set(row.platform, (publishedCounts.get(row.platform) ?? 0) + 1);
  }

  const upcomingRows = await db
    .select({ platform: posts.platform, scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(and(inArray(posts.status, ["scheduled", "awaiting_manual"]), gte(posts.scheduledAt, new Date())))
    .orderBy(posts.scheduledAt)
    .limit(6);

  const ideaRows = await db
    .select({ title: ideas.title })
    .from(ideas)
    .where(inArray(ideas.status, ["idea", "planned"]))
    .limit(10);

  return buildInputDigest({
    creatorName,
    comments: digestComments,
    accountSnapshots: snapshotRows.map((row) => ({
      platform: row.platform,
      date: row.snapshotDate,
      followers: row.metrics.followers,
      views: row.metrics.views,
    })),
    publishedLast7d: [...publishedCounts.entries()].map(([platform, count]) => ({
      platform,
      count,
    })),
    scheduledNext: upcomingRows
      .filter((row) => row.scheduledAt !== null)
      .map((row) => ({ platform: row.platform, scheduledAt: row.scheduledAt!.toISOString() })),
    openIdeas: ideaRows.map((row) => row.title),
    videoTitles: videoTitleRows.map((v) => v.title ?? "").filter(Boolean),
    videoPerformance,
  });
}

async function callClaude(digest: Record<string, unknown>): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropic.apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: env.anthropic.briefingModel,
      // Mit der Video-Performance im Digest fällt die Antwort länger aus.
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(digest) }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

export async function processBriefing(): Promise<void> {
  const [config] = await db.select().from(settings).limit(1);
  const briefingDate = todayInTz(config?.timezone ?? DEFAULT_TIMEZONE);
  const creatorName = config?.creatorName ?? "David";

  await db
    .insert(briefings)
    .values({ briefingDate, status: "running", model: env.anthropic.briefingModel })
    .onConflictDoUpdate({
      target: briefings.briefingDate,
      set: { status: "running", error: null, updatedAt: new Date() },
    });

  try {
    await syncAllComments();
  } catch (error) {
    logger.warn({ err: String(error) }, "briefing: Kommentar-Sync fehlgeschlagen — nutze Bestand");
  }

  const digest = await gatherDigest(creatorName);
  await db
    .update(briefings)
    .set({ inputDigest: digest, updatedAt: new Date() })
    .where(eq(briefings.briefingDate, briefingDate));

  if (!env.anthropic.apiKey) {
    await db
      .update(briefings)
      .set({
        status: "failed",
        error:
          "Kein Claude-Zugang konfiguriert — die Auswertung ist vorbereitet und läuft automatisch, sobald Jan ihn einträgt.",
        updatedAt: new Date(),
      })
      .where(eq(briefings.briefingDate, briefingDate));
    logger.warn("briefing: ohne ANTHROPIC_API_KEY — failed mit Hinweis gespeichert");
    return;
  }

  let lastRaw = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      lastRaw = await callClaude(digest);
      const parsed = parseBriefingJson(lastRaw);
      if (!parsed) throw new Error("Antwort nicht schema-konform");

      // replyCandidates auf existierende Kommentar-IDs beschränken.
      const knownIds = new Set(
        [
          ...((digest.topComments as Array<{ id: string }>) ?? []),
          ...((digest.newestComments as Array<{ id: string }>) ?? []),
        ].map((c) => c.id)
      );
      const replyCandidates = parsed.replyCandidates.filter((c) => knownIds.has(c.commentId));

      await db
        .update(briefings)
        .set({
          status: "completed",
          model: env.anthropic.briefingModel,
          summaryMd: parsed.summaryMd,
          contentIdeas: parsed.contentIdeas,
          replyCandidates,
          brandRecommendations: parsed.brandRecommendations,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(briefings.briefingDate, briefingDate));
      logger.info({ briefingDate, ideas: parsed.contentIdeas.length }, "briefing: fertig");
      return;
    } catch (error) {
      logger.warn({ attempt, err: String(error) }, "briefing: Versuch fehlgeschlagen");
    }
  }

  await db
    .update(briefings)
    .set({
      status: "failed",
      error: `Nach ${MAX_ATTEMPTS} Versuchen nicht schema-konform. Rohtext: ${lastRaw.slice(0, 1500)}`,
      updatedAt: new Date(),
    })
    .where(eq(briefings.briefingDate, briefingDate));
}
