import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plattformBereitschaft } from "./platform-status";

// Die Bereitschaft steuert, was ein Creator zu sehen bekommt. Ein falsches
// „Verbinden" schickt ihn in eine Sackgasse, die nach seinem Fehler aussieht —
// deshalb wird jeder der drei Zustände geprüft.

const SCHLUESSEL = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_APP_LIVE",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "TIKTOK_REDIRECT_URI",
  "TIKTOK_APP_LIVE",
  "IG_APP_ID",
  "IG_APP_SECRET",
  "IG_REDIRECT_URI",
  "IG_APP_LIVE",
];

let vorher: Record<string, string | undefined>;

beforeEach(() => {
  vorher = Object.fromEntries(SCHLUESSEL.map((k) => [k, process.env[k]]));
  for (const k of SCHLUESSEL) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(vorher)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("plattformBereitschaft", () => {
  it("bietet ohne Schlüssel keinen Verbinden-Link an", () => {
    const stand = plattformBereitschaft("youtube");
    expect(stand.bereitschaft).toBe("nicht_eingerichtet");
    // Wichtiger als der Text: kein Knopf, der garantiert in einen Fehler führt.
    expect(stand.href).toBeNull();
  });

  it("erkennt eine eingerichtete, aber noch nicht freigegebene App", () => {
    process.env.GOOGLE_CLIENT_ID = "x";
    process.env.GOOGLE_CLIENT_SECRET = "y";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/cb";

    const stand = plattformBereitschaft("youtube");
    expect(stand.bereitschaft).toBe("nur_eingeladene");
    expect(stand.href).toBe("/api/oauth/google/authorize");
  });

  it("gibt erst bei ausdrücklicher Freigabe frei", () => {
    process.env.TIKTOK_CLIENT_KEY = "x";
    process.env.TIKTOK_CLIENT_SECRET = "y";
    process.env.TIKTOK_REDIRECT_URI = "https://example.test/cb";
    process.env.TIKTOK_APP_LIVE = "true";

    expect(plattformBereitschaft("tiktok").bereitschaft).toBe("offen");
  });

  it("behandelt alles außer genau 'true' als nicht freigegeben", () => {
    process.env.IG_APP_ID = "x";
    process.env.IG_APP_SECRET = "y";
    process.env.IG_REDIRECT_URI = "https://example.test/cb";

    for (const wert of ["", "false", "1", "ja", "TRUE ", " true"]) {
      process.env.IG_APP_LIVE = wert;
      const erwartet = wert.trim().toLowerCase() === "true" ? "offen" : "nur_eingeladene";
      expect(plattformBereitschaft("instagram").bereitschaft, `bei ${JSON.stringify(wert)}`).toBe(
        erwartet
      );
    }
  });

  it("führt YouTube auf die Google-Route, nicht auf eine youtube-Route", () => {
    process.env.GOOGLE_CLIENT_ID = "x";
    process.env.GOOGLE_CLIENT_SECRET = "y";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/cb";
    // Die Plattform heißt youtube, die OAuth-Strecke läuft über Google.
    expect(plattformBereitschaft("youtube").href).toBe("/api/oauth/google/authorize");
  });
});
