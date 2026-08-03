import { afterEach, describe, expect, test } from "vitest";
import type { NextRequest } from "next/server";
import { appOrigin, appUrl } from "./origin";

// Der Fall, der David den Termin gekostet hätte: `next start` ersetzt den Host
// in req.url durch die Bind-Adresse. Hinter dem Tunnel wäre er nach der
// Zustimmung auf localhost:3000 gelandet — auf seinem eigenen Handy.
function anfrage(headers: Record<string, string>, url = "http://localhost:3000/api/oauth/x"): NextRequest {
  return {
    url,
    headers: new Headers(headers),
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

const vorher = process.env.APP_BASE_URL;
afterEach(() => {
  if (vorher === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = vorher;
});

describe("appOrigin", () => {
  test("konfigurierte Basis-URL gewinnt — sie kann niemand von außen setzen", () => {
    process.env.APP_BASE_URL = "https://hq.example.de";
    const origin = appOrigin(anfrage({ host: "boeser-host.test" }));
    expect(origin).toBe("https://hq.example.de");
  });

  test("abschließender Schrägstrich wird entfernt, damit keine Doppel-Slashes entstehen", () => {
    process.env.APP_BASE_URL = "https://hq.example.de/";
    expect(appUrl(anfrage({}), "/accounts?connected=youtube")).toBe(
      "https://hq.example.de/accounts?connected=youtube"
    );
  });

  test("ohne Konfiguration zählt der Proxy-Header, nicht req.url", () => {
    delete process.env.APP_BASE_URL;
    const origin = appOrigin(
      anfrage({ "x-forwarded-host": "zufall.trycloudflare.com", "x-forwarded-proto": "https" })
    );
    expect(origin).toBe("https://zufall.trycloudflare.com");
  });

  test("der Platzhalter localhost:3000 zählt nicht als Konfiguration", () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    const origin = appOrigin(
      anfrage({ "x-forwarded-host": "zufall.trycloudflare.com", "x-forwarded-proto": "https" })
    );
    expect(origin).toBe("https://zufall.trycloudflare.com");
  });

  test("ohne Proxy-Header bleibt der gewöhnliche Host", () => {
    delete process.env.APP_BASE_URL;
    expect(appOrigin(anfrage({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  test("ganz ohne Header fällt es auf die Anfrage-URL zurück, statt zu werfen", () => {
    delete process.env.APP_BASE_URL;
    expect(appOrigin(anfrage({}, "http://127.0.0.1:3000/api/oauth/x"))).toBe(
      "http://127.0.0.1:3000"
    );
  });
});

describe("appUrl", () => {
  test("baut eine absolute Adresse auf der Tunnel-Domain", () => {
    delete process.env.APP_BASE_URL;
    const url = appUrl(
      anfrage({ "x-forwarded-host": "zufall.trycloudflare.com", "x-forwarded-proto": "https" }),
      "/accounts?connected=tiktok"
    );
    expect(url).toBe("https://zufall.trycloudflare.com/accounts?connected=tiktok");
    expect(url).not.toContain("localhost");
  });
});
