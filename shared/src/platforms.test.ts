import { describe, expect, test } from "vitest";
import {
  isPublishPlatform,
  PLATFORM_LABELS,
  PLATFORM_SHORT,
  PUBLISH_PLATFORMS,
  publishTargetsSchema,
} from "./platforms";

describe("platforms", () => {
  test("kennt genau die drei Ziel-Plattformen", () => {
    expect(PUBLISH_PLATFORMS).toEqual(["youtube", "instagram", "tiktok"]);
  });

  test("isPublishPlatform unterscheidet gültig/ungültig", () => {
    expect(isPublishPlatform("tiktok")).toBe(true);
    expect(isPublishPlatform("facebook")).toBe(false);
    expect(isPublishPlatform(42)).toBe(false);
  });

  test("jede Plattform hat Label und Kürzel", () => {
    for (const platform of PUBLISH_PLATFORMS) {
      expect(PLATFORM_LABELS[platform]).toBeTruthy();
      expect(PLATFORM_SHORT[platform]).toMatch(/^[A-Z]{2}$/);
    }
  });

  test("publishTargetsSchema dedupliziert und validiert", () => {
    const parsed = publishTargetsSchema.parse(["tiktok", "tiktok", "youtube"]);

    expect(parsed).toEqual(["tiktok", "youtube"]);
    expect(() => publishTargetsSchema.parse(["myspace"])).toThrow();
  });
});
