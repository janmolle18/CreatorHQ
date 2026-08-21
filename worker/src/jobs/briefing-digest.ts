// Reiner Digest-Builder: verdichtet Kommentare, Trends, Posting-Frequenz und
// offene Ideen zum LLM-Input. Ohne IO, isoliert testbar; alles hart gekappt,
// damit der Prompt klein und das Ergebnis deterministisch bleibt.

// Dieselbe Grenze wie beim Ingest — sonst würde die Analyse ein Video anders
// einordnen als die Pipeline.
import { SHORTFORM_MAX_SECONDS } from "@creatorhq/shared";

export interface DigestComment {
  id: string; // externalCommentId
  videoId: string;
  videoTitle?: string | null;
  author: string | null;
  text: string;
  likes: number;
}

export interface DigestSnapshot {
  platform: string;
  date: string; // yyyy-MM-dd
  followers?: number;
  views?: number;
}

/** Kennzahlen eines eigenen Kanal-Videos des Creators (Referenz-Messung). */
export interface DigestVideoPerformance {
  title: string | null;
  durationSeconds: number | null;
  views: number;
  likes?: number;
  comments?: number;
}

export interface DigestInput {
  creatorName: string;
  comments: DigestComment[]; // erwartet: neueste zuerst
  accountSnapshots: DigestSnapshot[]; // letzte 7 Tage, aufsteigend sortiert
  publishedLast7d: Array<{ platform: string; count: number }>;
  scheduledNext: Array<{ platform: string; scheduledAt: string }>;
  openIdeas: string[];
  videoTitles: string[];
  /** Eigene Kanal-Videos des Creators mit aktuellen Zahlen — daraus lernen wir. */
  videoPerformance?: DigestVideoPerformance[];
}

const MAX_COMMENTS = 15;
const MAX_TEXT_LENGTH = 280;
const MAX_LIST = 10;
const MAX_PERFORMANCE = 8;

function byViewsDesc(a: DigestVideoPerformance, b: DigestVideoPerformance): number {
  return b.views - a.views;
}

function compactPerformance(video: DigestVideoPerformance) {
  return {
    title: video.title,
    laenge: video.durationSeconds === null ? null : `${video.durationSeconds}s`,
    views: video.views,
    likes: video.likes ?? null,
    kommentare: video.comments ?? null,
  };
}

/**
 * Was funktioniert? Beste und schwächste Videos — getrennt nach Shorts und
 * Langformat. Die Trennung ist Pflicht: YouTube zählt einen Short-View bereits
 * beim Anspielen, Views beider Formate sind daher NICHT vergleichbar.
 */
export function buildPerformanceDigest(videos: DigestVideoPerformance[]) {
  const withViews = videos.filter((video) => Number.isFinite(video.views) && video.views > 0);
  const shorts = withViews
    .filter((v) => v.durationSeconds !== null && v.durationSeconds <= SHORTFORM_MAX_SECONDS)
    .sort(byViewsDesc);
  const longform = withViews
    .filter((v) => v.durationSeconds === null || v.durationSeconds > SHORTFORM_MAX_SECONDS)
    .sort(byViewsDesc);

  const summarize = (list: DigestVideoPerformance[]) => {
    if (list.length === 0) return undefined;
    const half = Math.min(MAX_PERFORMANCE, list.length);
    const median = list[Math.floor((list.length - 1) / 2)]!;
    return {
      anzahl: list.length,
      medianViews: median.views,
      besteVideos: list.slice(0, half).map(compactPerformance),
      schwaechsteVideos: list.slice(-Math.min(3, list.length)).reverse().map(compactPerformance),
    };
  };

  return {
    hinweis:
      "Shorts- und Langformat-Views sind nicht vergleichbar (ein Short-View zählt " +
      "bereits beim Anspielen). Nur innerhalb einer Gruppe vergleichen.",
    shorts: summarize(shorts),
    langformat: summarize(longform),
  };
}

function compactComment(comment: DigestComment) {
  return {
    id: comment.id,
    videoId: comment.videoId,
    videoTitle: comment.videoTitle ?? null,
    author: comment.author,
    text:
      comment.text.length > MAX_TEXT_LENGTH
        ? `${comment.text.slice(0, MAX_TEXT_LENGTH)}…`
        : comment.text,
    likes: comment.likes,
  };
}

/**
 * Follower-Trend je Plattform aus den Snapshots der letzten 7 Tage.
 *
 * Bewusst OHNE View-Delta: Die Kanal-Aufrufzahl ist ein Lebenszeit-Zähler,
 * dessen Bezugsbasis sich ändern kann (Quelle, Anzahl erfasster Videos). Ein
 * „letzter minus erster"-Delta darüber hat dem Briefing bereits ein Wachstum
 * von +47.616 Aufrufen vorgegaukelt, das es nie gab. Was tatsächlich läuft,
 * steht viel belastbarer in videoPerformance (Zahlen je Video).
 */
export function computeTrends(
  snapshots: DigestSnapshot[]
): Array<{ platform: string; followers?: number; followersDelta?: number }> {
  const byPlatform = new Map<string, DigestSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = byPlatform.get(snapshot.platform) ?? [];
    byPlatform.set(snapshot.platform, [...list, snapshot]);
  }

  const trends: Array<{
    platform: string;
    followers?: number;
    followersDelta?: number;
  }> = [];
  for (const [platform, list] of byPlatform) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const entry: (typeof trends)[number] = { platform };
    if (typeof last.followers === "number") {
      entry.followers = last.followers;
      if (typeof first.followers === "number" && sorted.length > 1) {
        entry.followersDelta = last.followers - first.followers;
      }
    }
    trends.push(entry);
  }
  return trends;
}

export function buildInputDigest(input: DigestInput): Record<string, unknown> {
  const topComments = [...input.comments]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, MAX_COMMENTS)
    .map(compactComment);
  const topIds = new Set(topComments.map((c) => c.id));
  const newestComments = input.comments
    .filter((c) => !topIds.has(c.id))
    .slice(0, MAX_COMMENTS)
    .map(compactComment);

  const performance = input.videoPerformance ?? [];

  return {
    creatorName: input.creatorName,
    videoTitles: input.videoTitles.slice(0, MAX_LIST),
    topComments,
    newestComments,
    trends7d: computeTrends(input.accountSnapshots),
    ...(performance.length > 0 ? { videoPerformance: buildPerformanceDigest(performance) } : {}),
    postingFrequency7d: input.publishedLast7d,
    upcomingPosts: input.scheduledNext.slice(0, MAX_LIST),
    openIdeas: input.openIdeas.slice(0, MAX_LIST),
    commentTotal: input.comments.length,
  };
}
