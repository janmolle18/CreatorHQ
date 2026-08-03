import { describe, test, expect } from "vitest";
import {
  SHORTFORM_MAX_SECONDS,
  classifySource,
  classificationReason,
  isClipMaterial,
} from "./ingest-policy";

describe("classifySource", () => {
  test("Davids Langvideos sind Clip-Material", () => {
    for (const durationSeconds of [322, 567, 578, 1323]) {
      expect(classifySource({ durationSeconds })).toBe("clip_material");
    }
  });

  test("Davids fertige Shorts sind nur Referenz", () => {
    for (const durationSeconds of [5, 9, 17, 22, 37, 90, 91]) {
      expect(classifySource({ durationSeconds })).toBe("reference");
    }
  });

  test("Grenzwert: genau 180 s ist noch Short, 181 s ist Clip-Material", () => {
    expect(classifySource({ durationSeconds: SHORTFORM_MAX_SECONDS })).toBe("reference");
    expect(classifySource({ durationSeconds: SHORTFORM_MAX_SECONDS + 1 })).toBe("clip_material");
  });

  test("explizites Short-Signal schlägt die Dauer (yt-dlp /shorts-Tab ohne Dauer)", () => {
    expect(classifySource({ durationSeconds: null, isShort: true })).toBe("reference");
    expect(classifySource({ durationSeconds: 9999, isShort: true })).toBe("reference");
  });

  test("unbekannte oder unsinnige Dauer vertagt die Entscheidung", () => {
    expect(classifySource({ durationSeconds: null })).toBe("unknown");
    expect(classifySource({})).toBe("unknown");
    expect(classifySource({ durationSeconds: 0 })).toBe("unknown");
    expect(classifySource({ durationSeconds: Number.NaN })).toBe("unknown");
  });

  test("isClipMaterial lässt nur eindeutiges Langmaterial durch", () => {
    expect(isClipMaterial({ durationSeconds: 600 })).toBe(true);
    expect(isClipMaterial({ durationSeconds: 30 })).toBe(false);
    expect(isClipMaterial({ durationSeconds: null })).toBe(false);
  });
});

describe("classificationReason", () => {
  test("nennt die Dauer, wenn sie bekannt ist", () => {
    expect(classificationReason({ durationSeconds: 17 })).toContain("17 s");
  });

  test("kommt ohne Dauer aus", () => {
    expect(classificationReason({ durationSeconds: null, isShort: true })).toContain("Referenz");
    expect(classificationReason({ durationSeconds: null })).toBe("Dauer unbekannt");
  });
});
