import { describe, expect, test } from "vitest";
import { srtTimeToAss, srtToAss } from "./subtitle-style";

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,500
Bruder, was macht sie?

2
00:00:04,000 --> 00:00:06,250
Wow! Wow!
Die Leute feiern das.
`;

describe("srtTimeToAss", () => {
  test("konvertiert SRT-Zeit nach ASS (Centisekunden)", () => {
    expect(srtTimeToAss("00:00:01,000")).toBe("0:00:01.00");
    expect(srtTimeToAss("01:02:03,456")).toBe("1:02:03.46");
    expect(srtTimeToAss("00:10:00.5")).toBe("0:10:00.50");
  });

  test("lehnt Unsinn ab", () => {
    expect(srtTimeToAss("abc")).toBeNull();
    expect(srtTimeToAss("1:2:3")).toBeNull();
  });
});

describe("srtToAss", () => {
  test("erzeugt ASS mit Style-Header und Dialogue-Zeilen", () => {
    const ass = srtToAss(SAMPLE_SRT);

    expect(ass).toContain("[V4+ Styles]");
    // Größe 11, Box (BorderStyle 3) und MarginV 24 = fest im unteren Blur-Band
    expect(ass).toContain("Style: TikTok,DejaVu Sans,11,");
    expect(ass).toContain(",3,2,0,2,40,40,24,1");
    expect(ass).toContain(
      "Dialogue: 0,0:00:01.00,0:00:03.50,TikTok,,0,0,0,,Bruder, was macht sie?"
    );
    // Mehrzeilige Blöcke werden mit \N verbunden
    expect(ass).toContain("Wow! Wow!\\NDie Leute feiern das.");
  });

  test("neutralisiert ASS-Override-Klammern", () => {
    const ass = srtToAss("1\n00:00:00,000 --> 00:00:01,000\n{\\b1}fett?");

    expect(ass).not.toContain("{\\b1}");
    expect(ass).toContain("(\\b1)fett?");
  });

  test("überspringt kaputte Blöcke statt zu werfen", () => {
    const ass = srtToAss("kein srt\n\n2\nfehlt die zeit\nText");

    expect(ass).toContain("[Events]");
    expect(ass).not.toContain("Dialogue:");
  });
});
