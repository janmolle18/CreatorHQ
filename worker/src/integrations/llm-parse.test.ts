import { describe, expect, test } from "vitest";
import {
  heuristicCaption,
  normalizeHashtags,
  parseCaptionJson,
} from "./llm-parse";

describe("normalizeHashtags", () => {
  test("normalisiert, dedupliziert und begrenzt auf 6", () => {
    const input = ["#Fitness", "fitness", "  #GYM Life ", "über-mut", "a", "b", "c", "d"];

    const result = normalizeHashtags(input);

    expect(result).toEqual(["#fitness", "#gymlife", "#übermut", "#a", "#b", "#c"]);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  test("wirft leere und rein symbolische Einträge raus", () => {
    expect(normalizeHashtags(["", "###", "!!!", "#ok"])).toEqual(["#ok"]);
  });
});

describe("parseCaptionJson", () => {
  test("parst sauberes JSON", () => {
    const raw = '{"caption": "Der Moment, in dem alles kippt.", "hashtags": ["party", "australien"]}';

    expect(parseCaptionJson(raw)).toEqual({
      caption: "Der Moment, in dem alles kippt.",
      hashtags: ["#party", "#australien"],
    });
  });

  test("toleriert Text um das JSON herum", () => {
    const raw = 'Hier ist deine Caption:\n{"caption": "Test", "hashtags": []}\nViel Erfolg!';

    expect(parseCaptionJson(raw)?.caption).toBe("Test");
  });

  test("lehnt kaputtes JSON und falsche Formen ab", () => {
    expect(parseCaptionJson("kein json")).toBeNull();
    expect(parseCaptionJson('{"caption": ""}')).toBeNull();
    expect(parseCaptionJson('{"hashtags": ["x"]}')).toBeNull();
    expect(parseCaptionJson('{"caption": 42, "hashtags": []}')).toBeNull();
  });
});

describe("heuristicCaption", () => {
  test("nimmt den ersten Satz des Transkripts", () => {
    const result = heuristicCaption(
      "Heute wird alles anders, versprochen! Und zwar richtig.",
      "David"
    );

    expect(result.caption).toBe("Heute wird alles anders, versprochen!");
    expect(result.hashtags.length).toBeGreaterThan(0);
  });

  test("fällt bei leerem Transkript auf Standard-Caption zurück", () => {
    const result = heuristicCaption("", "David");

    expect(result.caption).toBe("Neuer Clip von David");
    expect(result.hashtags).toContain("#david");
  });
});
