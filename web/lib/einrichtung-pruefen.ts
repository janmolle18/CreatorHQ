import "server-only";
import { PUBLISH_PLATFORMS, type PublishPlatform } from "@creatorhq/shared";

/**
 * Prüft, ob die Plattform-Zugänge so eingetragen sind, dass Verbinden gelingt.
 *
 * Der mit Abstand häufigste Fehler beim Einrichten ist die Rückleitungsadresse:
 * Sie muss ZEICHENGENAU mit dem übereinstimmen, was bei Google, TikTok bzw.
 * Meta hinterlegt ist — inklusive Protokoll, Port und ohne Schrägstrich am
 * Ende. Weicht sie ab, bricht der Vorgang erst BEIM KUNDEN ab, mit einer
 * Meldung der Plattform, die niemand deuten kann („redirect_uri_mismatch").
 *
 * Diese Prüfung findet das vorher — auf der Systemseite, wo Technik hingehört.
 */

export type Befund = "fehlt" | "abweichend" | "passt";

export interface EinrichtungsStand {
  platform: PublishPlatform;
  /** Sind Kennung und Geheimnis überhaupt hinterlegt? */
  schluessel: Befund;
  /** Stimmt die Rückleitung mit dieser Installation überein? */
  rueckleitung: Befund;
  /** Was hinterlegt ist — zum Abgleich mit der Konsole der Plattform. */
  eingetragen: string;
  /** Was hier tatsächlich erwartet wird. */
  erwartet: string;
  /** Ein Satz Klartext. */
  hinweis: string;
}

/** Wohin die jeweilige Plattform zurückleiten muss. */
const RUECKLEITUNGS_PFAD: Record<PublishPlatform, string> = {
  youtube: "/api/oauth/google/callback",
  tiktok: "/api/oauth/tiktok/callback",
  instagram: "/api/oauth/instagram/callback",
};

const ENV_NAMEN: Record<PublishPlatform, { id: string; geheim: string; ziel: string }> = {
  youtube: {
    id: "GOOGLE_CLIENT_ID",
    geheim: "GOOGLE_CLIENT_SECRET",
    ziel: "GOOGLE_REDIRECT_URI",
  },
  tiktok: { id: "TIKTOK_CLIENT_KEY", geheim: "TIKTOK_CLIENT_SECRET", ziel: "TIKTOK_REDIRECT_URI" },
  instagram: { id: "IG_APP_ID", geheim: "IG_APP_SECRET", ziel: "IG_REDIRECT_URI" },
};

/**
 * Vergleicht zwei Adressen so, wie die Plattformen es tun: zeichengenau, aber
 * ohne den Schrägstrich am Ende — den ergänzen manche Konsolen von selbst.
 */
export function adressenGleich(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\/+$/, "");
  return norm(a) !== "" && norm(a) === norm(b);
}

export function pruefeEinrichtung(
  // Schlichtes Verzeichnis statt NodeJS.ProcessEnv: So lässt sich die Funktion
  // mit einer Handvoll Werte prüfen, ohne die halbe Umgebung nachzubauen.
  env: Record<string, string | undefined> = process.env
): EinrichtungsStand[] {
  const basis = (env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");

  return PUBLISH_PLATFORMS.map((platform): EinrichtungsStand => {
    const namen = ENV_NAMEN[platform];
    const id = env[namen.id]?.trim() ?? "";
    const geheim = env[namen.geheim]?.trim() ?? "";
    const eingetragen = env[namen.ziel]?.trim() ?? "";
    const erwartet = basis ? `${basis}${RUECKLEITUNGS_PFAD[platform]}` : "";

    if (!id || !geheim) {
      return {
        platform,
        schluessel: "fehlt",
        rueckleitung: eingetragen ? "abweichend" : "fehlt",
        eingetragen,
        erwartet,
        hinweis: `${namen.id} und ${namen.geheim} eintragen — solange sie fehlen, zeigt die Verbinden-Seite gar keinen Knopf.`,
      };
    }

    if (!erwartet) {
      return {
        platform,
        schluessel: "passt",
        rueckleitung: "fehlt",
        eingetragen,
        erwartet,
        hinweis:
          "APP_BASE_URL fehlt. Ohne sie lässt sich nicht prüfen, wohin zurückgeleitet werden muss.",
      };
    }

    if (!adressenGleich(eingetragen, erwartet)) {
      return {
        platform,
        schluessel: "passt",
        rueckleitung: "abweichend",
        eingetragen,
        erwartet,
        hinweis: `${namen.ziel} weicht ab. Genau diese Adresse muss auch in der Konsole der Plattform stehen — zeichengenau, sonst bricht das Verbinden beim Kunden ab.`,
      };
    }

    return {
      platform,
      schluessel: "passt",
      rueckleitung: "passt",
      eingetragen,
      erwartet,
      hinweis: "Eingerichtet. Prüf zuletzt, ob genau diese Adresse auch bei der Plattform steht.",
    };
  });
}

/** Kurzfassung für die Übersicht: Kann sich gerade überhaupt jemand verbinden? */
export function verbindenMoeglich(stand: EinrichtungsStand[]): PublishPlatform[] {
  return stand
    .filter((e) => e.schluessel === "passt" && e.rueckleitung === "passt")
    .map((e) => e.platform);
}
