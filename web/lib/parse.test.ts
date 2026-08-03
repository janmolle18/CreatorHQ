import { describe, expect, test } from "vitest";
import {
  parseTwitchLogin,
  parseTwitchVodId,
  parseYoutubeChannel,
  parseYoutubeVideoId,
} from "./parse";

describe("parseYoutubeVideoId", () => {
  test("watch?v=", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  test("youtu.be Kurzlink", () => {
    expect(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
  });

  test("shorts, live und embed", () => {
    expect(parseYoutubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("blanke 11-Zeichen-ID", () => {
    expect(parseYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("Unsinn wird abgelehnt", () => {
    expect(parseYoutubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYoutubeVideoId("https://youtube.com/@davidvorkamera")).toBeNull();
    expect(parseYoutubeVideoId("zu-kurz")).toBeNull();
    expect(parseYoutubeVideoId("")).toBeNull();
  });
});

describe("parseYoutubeChannel", () => {
  test("Handle-Link und /channel/-Link", () => {
    expect(parseYoutubeChannel("https://www.youtube.com/@davidvorkamera")).toBe(
      "@davidvorkamera"
    );
    expect(parseYoutubeChannel("https://youtube.com/channel/UCabc123")).toBe("UCabc123");
  });

  test("Legacy /user/ und /c/", () => {
    expect(parseYoutubeChannel("https://youtube.com/user/legacyname")).toBe("@legacyname");
    expect(parseYoutubeChannel("https://youtube.com/c/brandname")).toBe("@brandname");
  });

  test("blanke Werte", () => {
    expect(parseYoutubeChannel("@name")).toBe("@name");
    expect(parseYoutubeChannel("UCabc123")).toBe("UCabc123");
    expect(parseYoutubeChannel("name")).toBe("@name");
  });
});

describe("parseTwitchVodId", () => {
  test("VOD-Link", () => {
    expect(parseTwitchVodId("https://www.twitch.tv/videos/2147483647")).toBe("2147483647");
  });

  test("blanke numerische ID", () => {
    expect(parseTwitchVodId("123456789")).toBe("123456789");
  });

  test("Profil-Link ist keine VOD", () => {
    expect(parseTwitchVodId("https://twitch.tv/somestreamer")).toBeNull();
  });
});

describe("parseTwitchLogin", () => {
  test("Profil-Link → Login", () => {
    expect(parseTwitchLogin("https://twitch.tv/SomeName")).toBe("somename");
  });

  test("blanker Name", () => {
    expect(parseTwitchLogin("@SomeName")).toBe("somename");
  });
});
