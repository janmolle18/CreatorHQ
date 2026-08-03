import { describe, expect, test } from "vitest";
import {
  buildVideoMetadata,
  MAX_TAGS_TOTAL_LENGTH,
  MAX_TITLE_LENGTH,
  quotaDayKey,
} from "./youtube-metadata";

describe("buildVideoMetadata", () => {
  test("nutzt Titel, sonst Caption, sonst Standard", () => {
    expect(
      buildVideoMetadata({ title: "Mein Titel", caption: "Cap", hashtags: [] }).title
    ).toBe("Mein Titel");
    expect(
      buildVideoMetadata({ title: null, caption: "Die Caption", hashtags: [] }).title
    ).toBe("Die Caption");
    expect(
      buildVideoMetadata({ title: null, caption: null, hashtags: [], creatorName: "David" })
        .title
    ).toBe("Neuer Clip von David");
  });

  test("kürzt überlange Titel auf 100 Zeichen mit Ellipse", () => {
    const { title } = buildVideoMetadata({
      title: "x".repeat(150),
      caption: null,
      hashtags: [],
    });

    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(title.endsWith("…")).toBe(true);
  });

  test("entfernt spitze Klammern (YouTube-Verbot)", () => {
    const { title } = buildVideoMetadata({
      title: "Clip <script> mit > Klammern",
      caption: null,
      hashtags: [],
    });

    expect(title).not.toMatch(/[<>]/);
  });

  test("Tags: ohne #, dedupliziert, Gesamtlänge begrenzt", () => {
    const { tags } = buildVideoMetadata({
      title: "t",
      caption: null,
      hashtags: ["#david", "#david", "#clips", `#${"lang".repeat(30)}`],
    });

    expect(tags).toContain("david");
    expect(tags).toContain("clips");
    expect(tags.filter((t) => t === "david")).toHaveLength(1);
    expect(tags.join("").length).toBeLessThanOrEqual(MAX_TAGS_TOTAL_LENGTH);
  });

  test("Beschreibung = Caption + Hashtags", () => {
    const { description } = buildVideoMetadata({
      title: "t",
      caption: "Die Caption.",
      hashtags: ["#a", "#b"],
    });

    expect(description).toBe("Die Caption.\n\n#a #b");
  });
});

describe("quotaDayKey", () => {
  test("Tageswechsel folgt Pacific Time (Google-Quota-Reset)", () => {
    // 08:30 UTC = 01:30 PDT → gleicher Tag; 06:30 UTC = 23:30 PDT Vortag.
    expect(quotaDayKey(new Date("2026-07-15T08:30:00Z"))).toBe("yt:quota:2026-07-15");
    expect(quotaDayKey(new Date("2026-07-15T06:30:00Z"))).toBe("yt:quota:2026-07-14");
  });
});
