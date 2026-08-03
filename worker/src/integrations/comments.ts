import { comments, db, posts, socialAccounts, sourceVideos } from "@creatorhq/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { execa } from "execa";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import { fetchWithRetry } from "./http.ts";
import { withFreshToken } from "./tokens.ts";

// Kommentar-Sync: YouTube (API-Key, sonst keyless via yt-dlp — deckt auch die
// 4 Bestandsvideos ab) + Instagram (nur verbunden). TikTok bewusst ausgelassen:
// die API gibt Kommentare praktisch nicht her (siehe PLAN, Risiken).

const YT_API = "https://www.googleapis.com/youtube/v3";
const IG_GRAPH = "https://graph.instagram.com";
const MAX_COMMENTS_PER_VIDEO = 100;

interface UpsertComment {
  platform: "youtube" | "instagram";
  postId: string | null;
  externalVideoId: string;
  externalCommentId: string;
  author: string | null;
  text: string;
  likeCount: number;
  replyCount: number;
  publishedAt: Date | null;
  raw?: Record<string, unknown>;
}

async function upsertComment(entry: UpsertComment): Promise<void> {
  if (!entry.text.trim()) return;
  await db
    .insert(comments)
    .values(entry)
    .onConflictDoUpdate({
      target: [comments.platform, comments.externalCommentId],
      set: {
        likeCount: entry.likeCount,
        replyCount: entry.replyCount,
        text: entry.text,
        postId: entry.postId,
        updatedAt: new Date(),
      },
    });
}

/** Alle bekannten YouTube-Videos: Quellvideos + veröffentlichte Posts. */
async function knownYoutubeVideos(): Promise<
  Array<{ videoId: string; postId: string | null }>
> {
  const sources = await db
    .select({ externalId: sourceVideos.externalId })
    .from(sourceVideos)
    .where(eq(sourceVideos.platform, "youtube"));
  const published = await db
    .select({ externalPostId: posts.externalPostId, id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.platform, "youtube"),
        isNotNull(posts.externalPostId),
        inArray(posts.status, ["posted", "published"])
      )
    );

  const byVideo = new Map<string, string | null>();
  for (const source of sources) byVideo.set(source.externalId, null);
  for (const post of published) byVideo.set(post.externalPostId!, post.id);
  return [...byVideo.entries()].map(([videoId, postId]) => ({ videoId, postId }));
}

async function fetchViaApi(videoId: string): Promise<Omit<UpsertComment, "postId">[]> {
  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    maxResults: "100",
    order: "relevance",
    textFormat: "plainText",
    key: env.youtube.apiKey,
  });
  const res = await fetchWithRetry(`${YT_API}/commentThreads?${params}`);
  if (res.status === 403) {
    // Kommentare deaktiviert o. Ä. — kein Fehler, nur überspringen.
    return [];
  }
  if (!res.ok) throw new Error(`commentThreads ${res.status}`);
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        totalReplyCount?: number;
        topLevelComment?: {
          snippet?: {
            textOriginal?: string;
            authorDisplayName?: string;
            likeCount?: number;
            publishedAt?: string;
          };
        };
      };
    }>;
  };
  return (data.items ?? []).map((item) => {
    const snippet = item.snippet?.topLevelComment?.snippet;
    return {
      platform: "youtube" as const,
      externalVideoId: videoId,
      externalCommentId: item.id,
      author: snippet?.authorDisplayName ?? null,
      text: snippet?.textOriginal ?? "",
      likeCount: snippet?.likeCount ?? 0,
      replyCount: item.snippet?.totalReplyCount ?? 0,
      publishedAt: snippet?.publishedAt ? new Date(snippet.publishedAt) : null,
    };
  });
}

async function fetchViaYtdlp(videoId: string): Promise<Omit<UpsertComment, "postId">[]> {
  const { stdout } = await execa(env.paths.ytdlp, [
    "-J",
    "--skip-download",
    "--write-comments",
    "--no-warnings",
    "--extractor-args", `youtube:max_comments=${MAX_COMMENTS_PER_VIDEO}`,
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  const data = JSON.parse(stdout) as {
    comments?: Array<{
      id?: string;
      parent?: string;
      text?: string;
      author?: string;
      like_count?: number;
      timestamp?: number;
    }>;
  };
  const all = data.comments ?? [];
  const replyCounts = new Map<string, number>();
  for (const comment of all) {
    if (comment.parent && comment.parent !== "root") {
      replyCounts.set(comment.parent, (replyCounts.get(comment.parent) ?? 0) + 1);
    }
  }
  return all
    .filter((comment) => comment.parent === "root" && comment.id)
    .map((comment) => ({
      platform: "youtube" as const,
      externalVideoId: videoId,
      externalCommentId: comment.id!,
      author: comment.author ?? null,
      text: comment.text ?? "",
      likeCount: typeof comment.like_count === "number" ? comment.like_count : 0,
      replyCount: replyCounts.get(comment.id!) ?? 0,
      publishedAt: comment.timestamp ? new Date(comment.timestamp * 1000) : null,
    }));
}

export async function syncYoutubeComments(): Promise<number> {
  const videos = await knownYoutubeVideos();
  let written = 0;
  for (const video of videos) {
    try {
      const entries = env.youtube.apiKey
        ? await fetchViaApi(video.videoId)
        : await fetchViaYtdlp(video.videoId);
      for (const entry of entries) {
        await upsertComment({ ...entry, postId: video.postId });
        written += 1;
      }
    } catch (error) {
      logger.warn(
        { videoId: video.videoId, err: String(error) },
        "comments: YouTube-Video übersprungen"
      );
    }
  }
  logger.info(
    { videos: videos.length, written, quelle: env.youtube.apiKey ? "api" : "yt-dlp" },
    "comments: YouTube synchronisiert"
  );
  return written;
}

export async function syncInstagramComments(): Promise<number> {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.platform, "instagram"));
  if (account?.status !== "connected") return 0;

  const token = await withFreshToken(account.id);
  const published = await db
    .select({ id: posts.id, externalPostId: posts.externalPostId })
    .from(posts)
    .where(
      and(
        eq(posts.platform, "instagram"),
        isNotNull(posts.externalPostId),
        inArray(posts.status, ["posted", "published"])
      )
    );

  let written = 0;
  for (const post of published) {
    try {
      const params = new URLSearchParams({
        fields: "id,text,username,like_count,timestamp",
        access_token: token,
      });
      const res = await fetchWithRetry(
        `${IG_GRAPH}/${post.externalPostId}/comments?${params}`
      );
      if (!res.ok) throw new Error(`IG comments ${res.status}`);
      const data = (await res.json()) as {
        data?: Array<{
          id?: string;
          text?: string;
          username?: string;
          like_count?: number;
          timestamp?: string;
        }>;
      };
      for (const comment of data.data ?? []) {
        if (!comment.id) continue;
        await upsertComment({
          platform: "instagram",
          postId: post.id,
          externalVideoId: post.externalPostId!,
          externalCommentId: comment.id,
          author: comment.username ?? null,
          text: comment.text ?? "",
          likeCount: comment.like_count ?? 0,
          replyCount: 0,
          publishedAt: comment.timestamp ? new Date(comment.timestamp) : null,
        });
        written += 1;
      }
    } catch (error) {
      logger.warn({ postId: post.id, err: String(error) }, "comments: IG-Post übersprungen");
    }
  }
  return written;
}

export async function syncAllComments(): Promise<{ youtube: number; instagram: number }> {
  const youtube = await syncYoutubeComments();
  const instagram = await syncInstagramComments();
  return { youtube, instagram };
}
