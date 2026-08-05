import { describe, expect, test } from "vitest";
import { fehlendeBerechtigungen, angefragteBerechtigungen } from "./verbindung-pruefen";

// Der häufigste Grund, warum ein Upload beim ersten echten Versuch scheitert:
// Beim Zustimmen war der Haken für „hochladen" nicht dabei. Die Plattform
// meldet trotzdem „verbunden" — nur eben ohne die eine Berechtigung, auf die
// es ankommt. Das hier fängt es ab, BEVOR ein Video rausgehen soll.

describe("fehlende Berechtigungen", () => {
  test("YouTube ohne Upload-Recht wird erkannt", () => {
    const erteilt = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ];
    expect(fehlendeBerechtigungen("youtube", erteilt)).toEqual([
      "https://www.googleapis.com/auth/youtube.upload",
    ]);
  });

  test("YouTube mit Upload-Recht ist vollständig", () => {
    const erteilt = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ];
    expect(fehlendeBerechtigungen("youtube", erteilt)).toEqual([]);
  });

  test("TikTok ohne video.publish wird erkannt", () => {
    expect(fehlendeBerechtigungen("tiktok", ["user.info.basic"])).toEqual(["video.publish"]);
  });

  test("Instagram ohne content_publish wird erkannt", () => {
    expect(fehlendeBerechtigungen("instagram", ["instagram_business_basic"])).toEqual([
      "instagram_business_content_publish",
    ]);
  });

  test("gar keine Berechtigungen — alles fehlt", () => {
    // Fällt zu, nicht auf: Eine leere Liste darf nicht als „passt schon" gelten.
    expect(fehlendeBerechtigungen("youtube", [])).toHaveLength(1);
    expect(fehlendeBerechtigungen("tiktok", [])).toHaveLength(1);
    expect(fehlendeBerechtigungen("instagram", [])).toHaveLength(1);
  });

  test("unbekannte Plattform meldet nichts Fehlendes", () => {
    // Bewusst leer statt Fehler: Diese Funktion entscheidet nicht, welche
    // Plattformen es gibt — das tut PUBLISH_PLATFORMS.
    expect(fehlendeBerechtigungen("myspace", [])).toEqual([]);
  });
});

describe("angefragte Berechtigungen", () => {
  test("jede Plattform fragt ihre Pflicht-Berechtigung auch wirklich an", () => {
    // Der eigentliche Wächter: Wenn jemand die Upload-Berechtigung aus der
    // Anfrage entfernt, wäre die Prüfung oben eine Prüfung auf etwas, das nie
    // erteilt werden KANN — und jeder Creator bekäme „geht noch nicht".
    for (const [platform, pflicht] of [
      ["youtube", "https://www.googleapis.com/auth/youtube.upload"],
      ["tiktok", "video.publish"],
      ["instagram", "instagram_business_content_publish"],
    ] as const) {
      expect(angefragteBerechtigungen(platform)).toContain(pflicht);
    }
  });
});
