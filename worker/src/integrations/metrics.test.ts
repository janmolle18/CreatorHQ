import { describe, expect, test } from "vitest";
import {
  normalizeIgAccount,
  normalizeIgMediaInsights,
  normalizeTiktokVideo,
  normalizeYoutubeChannelStats,
  normalizeYoutubeVideoStats,
  normalizeYtdlpChannel,
} from "./metrics";

describe("Metrik-Normalisierung", () => {
  test("YouTube-Channel-Stats: String-Zahlen werden konvertiert", () => {
    expect(
      normalizeYoutubeChannelStats({
        subscriberCount: "1234",
        viewCount: "56789",
        videoCount: "4",
      })
    ).toEqual({ followers: 1234, views: 56789, videos: 4 });
  });

  test("fehlende/kaputte Felder werden weggelassen statt NaN", () => {
    expect(
      normalizeYoutubeChannelStats({ subscriberCount: "abc", viewCount: undefined })
    ).toEqual({});
    expect(normalizeYoutubeVideoStats({ viewCount: "-5" })).toEqual({});
    expect(normalizeYoutubeVideoStats({ viewCount: "10", likeCount: "3" })).toEqual({
      views: 10,
      likes: 3,
    });
  });

  test("yt-dlp-Kanal: Videosummen laufen NICHT unter views (andere Bezugsgröße)", () => {
    expect(
      normalizeYtdlpChannel({
        channel_follower_count: 42,
        entries: [{ view_count: 100 }, { view_count: "250" }, { view_count: null }],
      })
    ).toEqual({ followers: 42, videosTabViews: 350, videos: 3 });
  });

  test("yt-dlp-Kanal ohne Entries liefert nur Follower", () => {
    expect(normalizeYtdlpChannel({ channel_follower_count: "7" })).toEqual({
      followers: 7,
    });
  });

  test("Instagram-Insights: data[]-Form wird flachgezogen", () => {
    expect(
      normalizeIgMediaInsights({
        data: [
          { name: "views", values: [{ value: 900 }] },
          { name: "likes", values: [{ value: "45" }] },
          { name: "kaputt", values: [] },
        ],
      })
    ).toEqual({ views: 900, likes: 45 });
    expect(normalizeIgAccount({ followers_count: 321 })).toEqual({ followers: 321 });
  });

  test("TikTok video.list wird normalisiert", () => {
    expect(
      normalizeTiktokVideo({
        view_count: 1000,
        like_count: "50",
        comment_count: 3,
        share_count: 0,
      })
    ).toEqual({ views: 1000, likes: 50, comments: 3, shares: 0 });
  });
});
