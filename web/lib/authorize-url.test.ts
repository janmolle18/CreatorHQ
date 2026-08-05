import { afterEach, beforeEach, describe, expect, test } from "vitest";

// Die Start-Adressen des Verbindens.
//
// Sie sehen harmlos aus und sind die Stelle, an der eine Verbindung
// STILLSCHWEIGEND unbrauchbar wird. Zwei Beispiele, die genau so passieren:
//
//   - Fehlt bei Google `access_type=offline`, liefert die Zustimmung kein
//     Auffrisch-Token. Das Verbinden meldet Erfolg, und eine Stunde später ist
//     der Zugang tot — ohne dass jemand etwas falsch gemacht hätte.
//   - Trennt man TikToks Berechtigungen mit Leerzeichen statt Komma, weist
//     TikTok die Anfrage ab. Google will es genau andersherum.
//
// Deshalb sind die Adressen hier festgenagelt, nicht nur "irgendwie gebaut".

const UMGEBUNG = {
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-geheim",
  GOOGLE_REDIRECT_URI: "https://hq.example/api/oauth/google/callback",
  TIKTOK_CLIENT_KEY: "tiktok-key",
  TIKTOK_CLIENT_SECRET: "tiktok-geheim",
  TIKTOK_REDIRECT_URI: "https://hq.example/api/oauth/tiktok/callback",
  IG_APP_ID: "ig-id",
  IG_APP_SECRET: "ig-geheim",
  IG_REDIRECT_URI: "https://hq.example/api/oauth/instagram/callback",
};

let vorher: Record<string, string | undefined>;

beforeEach(() => {
  vorher = {};
  for (const [name, wert] of Object.entries(UMGEBUNG)) {
    vorher[name] = process.env[name];
    process.env[name] = wert;
  }
});

afterEach(() => {
  for (const [name, wert] of Object.entries(vorher)) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
});

describe("Google", () => {
  test("fordert ein Auffrisch-Token an — sonst ist der Zugang nach einer Stunde tot", async () => {
    const { getGoogleAuthorizeUrl } = await import("./google");
    const url = new URL(getGoogleAuthorizeUrl("zustand-123"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    // `prompt=consent` erzwingt das Auffrisch-Token AUCH beim zweiten Mal.
    // Ohne das gibt Google es nur bei der allerersten Zustimmung heraus — und
    // ein Creator, der neu verbindet, bekäme keins mehr.
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  test("trennt Berechtigungen mit Leerzeichen — so will es Google", async () => {
    const { getGoogleAuthorizeUrl, YOUTUBE_SCOPES } = await import("./google");
    const url = new URL(getGoogleAuthorizeUrl("z"));
    expect(url.searchParams.get("scope")).toBe(YOUTUBE_SCOPES.join(" "));
  });

  test("fragt die Berechtigung zum Hochladen an", async () => {
    const { YOUTUBE_SCOPES } = await import("./google");
    expect(YOUTUBE_SCOPES).toContain("https://www.googleapis.com/auth/youtube.upload");
  });

  test("reicht Zustand und Rückleitung unverändert durch", async () => {
    const { getGoogleAuthorizeUrl } = await import("./google");
    const url = new URL(getGoogleAuthorizeUrl("zustand-123"));
    expect(url.searchParams.get("state")).toBe("zustand-123");
    expect(url.searchParams.get("redirect_uri")).toBe(UMGEBUNG.GOOGLE_REDIRECT_URI);
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("TikTok", () => {
  test("trennt Berechtigungen mit Komma — genau andersherum als Google", async () => {
    const { getAuthorizeUrl, TIKTOK_SCOPES } = await import("./tiktok");
    const url = new URL(getAuthorizeUrl("z", "pruefwert"));
    expect(url.searchParams.get("scope")).toBe(TIKTOK_SCOPES.join(","));
    expect(url.searchParams.get("scope")).not.toContain(" ");
  });

  test("nutzt PKCE mit S256 — TikTok weist alles andere ab", async () => {
    const { getAuthorizeUrl } = await import("./tiktok");
    const url = new URL(getAuthorizeUrl("z", "pruefwert"));
    expect(url.searchParams.get("code_challenge")).toBe("pruefwert");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  test("fragt die Berechtigung zum Veröffentlichen an", async () => {
    const { TIKTOK_SCOPES } = await import("./tiktok");
    expect(TIKTOK_SCOPES).toContain("video.publish");
  });

  test("der PKCE-Prüfwert ist bei jedem Aufruf neu", async () => {
    const { generatePkce } = await import("./tiktok");
    const a = generatePkce();
    const b = generatePkce();
    // Ein wiederverwendeter Prüfwert hebt den Schutz auf, für den er da ist.
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("Instagram", () => {
  test("trennt Berechtigungen mit Komma", async () => {
    const { getInstagramAuthorizeUrl, IG_SCOPES } = await import("./instagram");
    const url = new URL(getInstagramAuthorizeUrl("z"));
    expect(url.searchParams.get("scope")).toBe(IG_SCOPES.join(","));
  });

  test("fragt die Berechtigung zum Veröffentlichen an", async () => {
    const { IG_SCOPES } = await import("./instagram");
    expect(IG_SCOPES).toContain("instagram_business_content_publish");
  });
});

describe("alle drei", () => {
  test("tragen den Zustand mit — ohne ihn greift der CSRF-Schutz nicht", async () => {
    const { getGoogleAuthorizeUrl } = await import("./google");
    const { getAuthorizeUrl } = await import("./tiktok");
    const { getInstagramAuthorizeUrl } = await import("./instagram");
    for (const url of [
      getGoogleAuthorizeUrl("abc"),
      getAuthorizeUrl("abc", "p"),
      getInstagramAuthorizeUrl("abc"),
    ]) {
      expect(new URL(url).searchParams.get("state")).toBe("abc");
    }
  });

  test("zeigen auf die echten Zustimmungsseiten, nicht auf einen Platzhalter", async () => {
    const { getGoogleAuthorizeUrl } = await import("./google");
    const { getAuthorizeUrl } = await import("./tiktok");
    const { getInstagramAuthorizeUrl } = await import("./instagram");
    expect(getGoogleAuthorizeUrl("z")).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(getAuthorizeUrl("z", "p")).toMatch(/^https:\/\/www\.tiktok\.com\//);
    expect(getInstagramAuthorizeUrl("z")).toMatch(/^https:\/\/(www\.)?instagram\.com\//);
  });
});
