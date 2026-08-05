import { describe, expect, test } from "vitest";
import { adressenGleich, pruefeEinrichtung, verbindenMoeglich } from "./einrichtung-pruefen";

// Die Rückleitungsadresse ist der häufigste Grund, warum Verbinden scheitert —
// und der unangenehmste, weil der Fehler erst BEIM KUNDEN auftritt und die
// Meldung der Plattform („redirect_uri_mismatch") niemand deuten kann.

const VOLLSTAENDIG = {
  APP_BASE_URL: "https://creatorhq.example",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "geheim",
  GOOGLE_REDIRECT_URI: "https://creatorhq.example/api/oauth/google/callback",
  TIKTOK_CLIENT_KEY: "id",
  TIKTOK_CLIENT_SECRET: "geheim",
  TIKTOK_REDIRECT_URI: "https://creatorhq.example/api/oauth/tiktok/callback",
  IG_APP_ID: "id",
  IG_APP_SECRET: "geheim",
  IG_REDIRECT_URI: "https://creatorhq.example/api/oauth/instagram/callback",
};

describe("Adressenvergleich", () => {
  test("Schrägstrich am Ende zählt nicht — den ergänzen manche Konsolen selbst", () => {
    expect(adressenGleich("https://x.de/cb", "https://x.de/cb/")).toBe(true);
  });

  test("alles andere zählt sehr wohl", () => {
    expect(adressenGleich("http://x.de/cb", "https://x.de/cb")).toBe(false);
    expect(adressenGleich("https://x.de:3001/cb", "https://x.de/cb")).toBe(false);
    expect(adressenGleich("https://x.de/CB", "https://x.de/cb")).toBe(false);
  });

  test("leer gilt nie als gleich", () => {
    // Sonst würde „nichts eingetragen" gegen „nichts erwartet" als passend gelten.
    expect(adressenGleich("", "")).toBe(false);
  });
});

describe("Einrichtung", () => {
  test("vollständig konfiguriert — alle drei passen", () => {
    const stand = pruefeEinrichtung(VOLLSTAENDIG);
    expect(stand.every((e) => e.schluessel === "passt" && e.rueckleitung === "passt")).toBe(true);
    expect(verbindenMoeglich(stand)).toHaveLength(3);
  });

  test("ohne Schlüssel: gemeldet, und Verbinden ist unmöglich", () => {
    const stand = pruefeEinrichtung({ APP_BASE_URL: "https://x.de" });
    expect(stand.every((e) => e.schluessel === "fehlt")).toBe(true);
    expect(verbindenMoeglich(stand)).toEqual([]);
  });

  test("abweichende Rückleitung wird erkannt — der teuerste Tippfehler", () => {
    const stand = pruefeEinrichtung({
      ...VOLLSTAENDIG,
      GOOGLE_REDIRECT_URI: "https://creatorhq.example/api/oauth/google/callbck",
    });
    const youtube = stand.find((e) => e.platform === "youtube")!;
    expect(youtube.rueckleitung).toBe("abweichend");
    expect(youtube.erwartet).toBe("https://creatorhq.example/api/oauth/google/callback");
    expect(verbindenMoeglich(stand)).not.toContain("youtube");
  });

  test("falscher Port fällt auf — beim Wechsel von lokal auf Server der Klassiker", () => {
    const stand = pruefeEinrichtung({
      ...VOLLSTAENDIG,
      APP_BASE_URL: "https://creatorhq.example",
      TIKTOK_REDIRECT_URI: "http://localhost:3001/api/oauth/tiktok/callback",
    });
    expect(stand.find((e) => e.platform === "tiktok")!.rueckleitung).toBe("abweichend");
  });

  test("ohne APP_BASE_URL wird nicht geraten, sondern gesagt was fehlt", () => {
    const ohneBasis: Record<string, string | undefined> = { ...VOLLSTAENDIG };
    delete ohneBasis.APP_BASE_URL;
    const stand = pruefeEinrichtung(ohneBasis);
    expect(stand.every((e) => e.rueckleitung === "fehlt")).toBe(true);
    expect(stand[0]!.hinweis).toContain("APP_BASE_URL");
  });

  test("eine Plattform kann fertig sein, während die anderen fehlen", () => {
    // Der praktische Fall: Google zuerst, TikTok und Meta später.
    const stand = pruefeEinrichtung({
      APP_BASE_URL: "https://creatorhq.example",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "geheim",
      GOOGLE_REDIRECT_URI: "https://creatorhq.example/api/oauth/google/callback",
    });
    expect(verbindenMoeglich(stand)).toEqual(["youtube"]);
  });
});
