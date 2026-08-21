import { describe, expect, test } from "vitest";
import {
  buildInputDigest,
  buildPerformanceDigest,
  computeTrends,
  type DigestComment,
  type DigestVideoPerformance,
} from "./briefing-digest";

function makeComment(id: string, likes: number, text = "Nice!"): DigestComment {
  return { id, videoId: "vid1", author: "@fan", text, likes };
}

describe("computeTrends", () => {
  test("Follower-Delta = letzter minus erster Snapshot je Plattform", () => {
    const trends = computeTrends([
      { platform: "youtube", date: "2026-07-24", followers: 200, views: 2000 },
      { platform: "youtube", date: "2026-07-30", followers: 218, views: 2411 },
    ]);

    expect(trends).toEqual([{ platform: "youtube", followers: 218, followersDelta: 18 }]);
  });

  test("Aufrufe ergeben KEIN Delta — die Bezugsbasis kann wechseln", () => {
    // Genau dieser Fall ist passiert: Der Messumfang sprang von 4 auf 35
    // Videos, das Briefing meldete daraufhin +47.616 Aufrufe „Wachstum".
    const trends = computeTrends([
      { platform: "youtube", date: "2026-07-31", followers: 218, views: 2411 },
      { platform: "youtube", date: "2026-08-01", followers: 218, views: 50027 },
    ]);

    expect(trends[0]).not.toHaveProperty("viewsDelta");
  });

  test("einzelner Snapshot liefert Stand ohne Delta", () => {
    const trends = computeTrends([
      { platform: "youtube", date: "2026-07-30", followers: 218 },
    ]);

    expect(trends).toEqual([{ platform: "youtube", followers: 218 }]);
  });
});

describe("buildInputDigest", () => {
  test("Top-Kommentare nach Likes, neueste ohne Duplikate, alles gekappt", () => {
    const comments = Array.from({ length: 40 }, (_, i) => makeComment(`c${i}`, i));

    const digest = buildInputDigest({
      creatorName: "Alex",
      comments,
      accountSnapshots: [],
      publishedLast7d: [],
      scheduledNext: [],
      openIdeas: Array.from({ length: 20 }, (_, i) => `Idee ${i}`),
      videoTitles: [],
    });

    const top = digest.topComments as Array<{ id: string; likes: number }>;
    const newest = digest.newestComments as Array<{ id: string }>;
    expect(top).toHaveLength(15);
    expect(top[0]!.likes).toBe(39);
    const topIds = new Set(top.map((c) => c.id));
    expect(newest.some((c) => topIds.has(c.id))).toBe(false);
    expect(digest.openIdeas).toHaveLength(10);
    expect(digest.commentTotal).toBe(40);
  });

  test("lange Kommentartexte werden abgeschnitten", () => {
    const digest = buildInputDigest({
      creatorName: "Alex",
      comments: [makeComment("c1", 5, "x".repeat(500))],
      accountSnapshots: [],
      publishedLast7d: [],
      scheduledNext: [],
      openIdeas: [],
      videoTitles: [],
    });

    const top = digest.topComments as Array<{ text: string }>;
    expect(top[0]!.text.length).toBeLessThanOrEqual(281);
    expect(top[0]!.text.endsWith("…")).toBe(true);
  });

  test("leere Eingaben ergeben leeren, aber validen Digest", () => {
    const digest = buildInputDigest({
      creatorName: "Alex",
      comments: [],
      accountSnapshots: [],
      publishedLast7d: [],
      scheduledNext: [],
      openIdeas: [],
      videoTitles: [],
    });

    expect(digest.topComments).toEqual([]);
    expect(digest.trends7d).toEqual([]);
  });
});

describe("buildPerformanceDigest", () => {
  const video = (
    title: string,
    durationSeconds: number | null,
    views: number
  ): DigestVideoPerformance => ({ title, durationSeconds, views, likes: 1, comments: 0 });

  test("trennt Shorts und Langformat — die Views sind nicht vergleichbar", () => {
    const result = buildPerformanceDigest([
      video("Short stark", 17, 3500),
      video("Short schwach", 22, 120),
      video("Langvideo", 322, 354),
    ]);

    expect(result.shorts?.anzahl).toBe(2);
    expect(result.langformat?.anzahl).toBe(1);
    expect(result.shorts?.besteVideos[0]?.title).toBe("Short stark");
    expect(result.hinweis).toContain("nicht vergleichbar");
  });

  test("Videos ohne Views fallen raus, statt die Rangfolge zu verzerren", () => {
    const result = buildPerformanceDigest([video("Ohne Zahlen", 17, 0), video("Mit Zahlen", 17, 90)]);
    expect(result.shorts?.anzahl).toBe(1);
    expect(result.shorts?.besteVideos[0]?.title).toBe("Mit Zahlen");
  });

  test("Video ohne bekannte Dauer zählt als Langformat, nicht als Short", () => {
    const result = buildPerformanceDigest([video("Unbekannt", null, 500)]);
    expect(result.shorts).toBeUndefined();
    expect(result.langformat?.anzahl).toBe(1);
  });

  test("ohne Messwerte bleibt der Digest ohne Performance-Block", () => {
    const digest = buildInputDigest({
      creatorName: "Alex",
      comments: [],
      accountSnapshots: [],
      publishedLast7d: [],
      scheduledNext: [],
      openIdeas: [],
      videoTitles: [],
    });
    expect(digest.videoPerformance).toBeUndefined();
  });

  test("mit Messwerten hängt der Digest den Performance-Block an", () => {
    const digest = buildInputDigest({
      creatorName: "Alex",
      comments: [],
      accountSnapshots: [],
      publishedLast7d: [],
      scheduledNext: [],
      openIdeas: [],
      videoTitles: [],
      videoPerformance: [video("Short", 17, 900)],
    });
    expect(digest.videoPerformance).toBeDefined();
  });
});
