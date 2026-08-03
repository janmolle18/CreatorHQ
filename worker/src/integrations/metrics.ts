// Reine Metrik-Normalisierer: API-Payloads (Strings, fehlende Felder, Müll)
// → saubere Record<string, number>. Ohne IO, isoliert testbar.

export type SnapshotMetrics = Record<string, number>;

function toCount(value: unknown): number | null {
  const num =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function pick(source: Record<string, unknown>, mapping: Record<string, string>): SnapshotMetrics {
  const result: SnapshotMetrics = {};
  for (const [targetKey, sourceKey] of Object.entries(mapping)) {
    const value = toCount(source[sourceKey]);
    if (value !== null) result[targetKey] = value;
  }
  return result;
}

/** YouTube Data API: channels[].statistics (Zahlen kommen als Strings). */
export function normalizeYoutubeChannelStats(raw: Record<string, unknown>): SnapshotMetrics {
  return pick(raw, {
    followers: "subscriberCount",
    views: "viewCount",
    videos: "videoCount",
  });
}

/** yt-dlp --dump-single-json des Videos-Tabs (keyless-Fallback). */
export function normalizeYtdlpChannel(raw: {
  channel_follower_count?: unknown;
  entries?: Array<{ view_count?: unknown }>;
}): SnapshotMetrics {
  const result: SnapshotMetrics = {};
  const followers = toCount(raw.channel_follower_count);
  if (followers !== null) result.followers = followers;

  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  let views = 0;
  let counted = 0;
  for (const entry of entries) {
    const value = toCount(entry?.view_count);
    if (value !== null) {
      views += value;
      counted += 1;
    }
  }
  if (counted > 0) {
    // BEWUSST NICHT unter `views`: Das hier ist die Summe der Aufrufe der
    // gelisteten Videos, nicht die Lebenszeit-Aufrufzahl des Kanals, die die
    // Data API unter `views` liefert. Beides unter demselben Schlüssel zu
    // führen hat die 7-Tage-Trends verfälscht, sobald die Quelle wechselte
    // (Kanal sprang scheinbar von 2.411 auf 50.027 Aufrufe).
    result.videosTabViews = views;
    result.videos = entries.length;
  }
  return result;
}

/** YouTube Data API: videos[].statistics je Video. */
export function normalizeYoutubeVideoStats(raw: Record<string, unknown>): SnapshotMetrics {
  return pick(raw, {
    views: "viewCount",
    likes: "likeCount",
    comments: "commentCount",
  });
}

/** Instagram /me?fields=followers_count. */
export function normalizeIgAccount(raw: Record<string, unknown>): SnapshotMetrics {
  return pick(raw, { followers: "followers_count" });
}

/** Instagram Media-Insights: data[] mit {name, values:[{value}]}. */
export function normalizeIgMediaInsights(raw: {
  data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
}): SnapshotMetrics {
  const result: SnapshotMetrics = {};
  for (const entry of raw.data ?? []) {
    if (!entry.name) continue;
    const value = toCount(entry.values?.[0]?.value);
    if (value !== null) result[entry.name] = value;
  }
  return result;
}

/** TikTok video.list: view/like/comment/share je Video. */
export function normalizeTiktokVideo(raw: Record<string, unknown>): SnapshotMetrics {
  return pick(raw, {
    views: "view_count",
    likes: "like_count",
    comments: "comment_count",
    shares: "share_count",
  });
}
