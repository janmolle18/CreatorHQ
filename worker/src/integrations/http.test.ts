import { afterEach, describe, expect, test, vi } from "vitest";

const warn = vi.fn();
vi.mock("../logger.ts", () => ({ logger: { warn, info: vi.fn(), error: vi.fn() } }));

const { fetchWithRetry, redactUrl, retryDelayMs } = await import("./http.ts");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  warn.mockClear();
});

function antwort(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("redactUrl", () => {
  test("ersetzt das Instagram-Token, behält aber die Struktur lesbar", () => {
    const raw =
      "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=IGQVJYd3Geheim";
    const safe = redactUrl(raw);

    expect(safe).not.toContain("IGQVJYd3Geheim");
    expect(safe).toContain("access_token=%5Bentfernt%5D");
    expect(safe).toContain("grant_type=ig_refresh_token");
    expect(safe).toContain("graph.instagram.com");
  });

  test("ersetzt auch den YouTube-API-Schlüssel und den OAuth-Code", () => {
    const safe = redactUrl("https://www.googleapis.com/youtube/v3/comments?key=AIzaGeheim&code=4/xyz");
    expect(safe).not.toContain("AIzaGeheim");
    expect(safe).not.toContain("4/xyz");
  });

  test("URLs ohne Zugangsdaten bleiben unverändert nutzbar", () => {
    const raw = "https://www.googleapis.com/youtube/v3/videos?id=abc&part=statistics";
    expect(redactUrl(raw)).toBe(raw);
  });

  test("unlesbare Eingabe gibt nichts preis, statt sie durchzureichen", () => {
    expect(redactUrl("kein-url-format?access_token=geheim")).toBe("[unlesbare URL]");
  });
});

describe("retryDelayMs", () => {
  test("Retry-After als Sekundenzahl wird übernommen", () => {
    expect(retryDelayMs(0, "5")).toBe(5000);
  });

  test("Retry-After als HTTP-Datum wird in eine Wartezeit umgerechnet", () => {
    const inZehnSekunden = new Date(Date.now() + 10_000).toUTCString();
    const delay = retryDelayMs(0, inZehnSekunden);
    expect(delay).toBeGreaterThan(8_000);
    expect(delay).toBeLessThanOrEqual(10_000);
  });

  test("ein Datum in der Vergangenheit wartet nicht rückwärts", () => {
    expect(retryDelayMs(0, new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  test("Wartezeit ist gedeckelt — eine Plattform darf uns nicht stundenlang blockieren", () => {
    expect(retryDelayMs(0, "99999")).toBe(30_000);
    expect(retryDelayMs(20, null)).toBe(30_000);
  });

  test("ohne Header wächst die Wartezeit exponentiell", () => {
    expect(retryDelayMs(0, null)).toBeGreaterThanOrEqual(1000);
    expect(retryDelayMs(2, null)).toBeGreaterThanOrEqual(4000);
  });
});

describe("fetchWithRetry", () => {
  test("4xx kommt sofort zurück — das ist ein Anwendungsfehler, kein Transportproblem", async () => {
    const fetchMock = vi.fn().mockResolvedValue(antwort(404));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.test/a");

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("429 wird wiederholt und der Erfolg zurückgegeben", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(antwort(429, { "retry-after": "0" }))
      .mockResolvedValueOnce(antwort(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.test/a", {}, 2);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("nach dem letzten Versuch wird die Fehlerantwort zurückgegeben, nicht geworfen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(antwort(503, { "retry-after": "0" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.test/a", {}, 1);

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("die Retry-Logzeile enthält das Token nicht", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(antwort(429, { "retry-after": "0" }))
      .mockResolvedValueOnce(antwort(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithRetry("https://graph.instagram.com/me?access_token=IGQVJYgeheim", {}, 2);

    expect(warn).toHaveBeenCalled();
    const geloggt = JSON.stringify(warn.mock.calls);
    expect(geloggt).not.toContain("IGQVJYgeheim");
    expect(geloggt).toContain("entfernt");
  });

  test("auch bei Netzwerkfehlern steht kein Token im Log", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(antwort(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithRetry("https://graph.instagram.com/me?access_token=IGQVJYgeheim", {}, 2);

    const geloggt = JSON.stringify(warn.mock.calls);
    expect(geloggt).not.toContain("IGQVJYgeheim");
  });
});
