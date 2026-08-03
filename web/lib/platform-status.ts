import type { PublishPlatform } from "@creatorhq/shared";
import { googleConfig } from "./google";
import { instagramConfig } from "./instagram";
import { tiktokConfig } from "./tiktok";

// Was ein Creator beim Verbinden wirklich erwartet.
//
// Technisch ist Verbinden überall ein einziger Link — die drei Start-Routen
// unter /api/oauth/*/authorize sind fertig. Ob dieser Link für JEDEN
// funktioniert, entscheidet aber nicht der Code, sondern der Zulassungsstand
// der Entwickler-App bei der Plattform:
//
//   Google:    Solange die App auf "Test" steht, dürfen nur ausdrücklich
//              eingetragene Test-Nutzer zustimmen (max. 100). Erst nach der
//              Überprüfung darf jeder — vorher zeigt Google zusätzlich eine
//              rote Warnseite.
//   TikTok:    In der Sandbox darf nur zustimmen, wer als Ziel-Nutzer
//              eingetragen ist und sich dafür einmal selbst einloggt.
//   Instagram: Im Entwicklungsmodus darf nur zustimmen, wer als Tester
//              eingeladen wurde UND die Einladung angenommen hat.
//
// Diese Datei macht den Unterschied sichtbar, statt einen Knopf anzubieten,
// der beim Kunden in einer Fehlermeldung endet.

export type Bereitschaft =
  /** Schlüssel fehlen — die Entwickler-App existiert noch nicht. */
  | "nicht_eingerichtet"
  /** App existiert, ist aber noch nicht freigegeben: nur eingetragene Konten. */
  | "nur_eingeladene"
  /** Freigegeben — jeder kann sich mit einem Klick verbinden. */
  | "offen";

export interface PlattformBereitschaft {
  bereitschaft: Bereitschaft;
  /** Ziel des Verbinden-Knopfs, oder null wenn Verbinden keinen Sinn ergibt. */
  href: string | null;
  /** Was der Creator jetzt tun kann — in seinen Worten. */
  hinweis: string;
}

/**
 * `*_APP_LIVE=true` wird gesetzt, sobald die Plattform die App freigegeben hat.
 * Bewusst ein bewusster Handgriff und keine Vermutung: Eine falsch geratene
 * Freigabe schickt Creator in eine Sackgasse, die nach ihrem Fehler aussieht.
 */
function istFreigegeben(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

const HINWEISE: Record<PublishPlatform, Record<Bereitschaft, string>> = {
  youtube: {
    nicht_eingerichtet: "Wir richten den YouTube-Zugang gerade ein. Du hörst von uns, sobald er steht.",
    nur_eingeladene:
      "YouTube prüft unsere App noch. Schreib uns deine Google-Adresse — dann schalten wir dich frei und du kannst verbinden. Google zeigt dabei eine rote Warnseite; über „Erweitert → Weiter“ geht es sicher weiter.",
    offen: "Ein Klick, YouTube fragt nach deiner Zustimmung, fertig.",
  },
  tiktok: {
    nicht_eingerichtet: "Wir richten den TikTok-Zugang gerade ein. Du hörst von uns, sobald er steht.",
    nur_eingeladene:
      "TikTok prüft unsere App noch. Schick uns deinen @-Namen — danach kannst du verbinden. Bis zur Freigabe landen Videos als Entwurf in deinem TikTok-Postfach, statt direkt zu erscheinen.",
    offen: "Ein Klick, TikTok fragt nach deiner Zustimmung, fertig.",
  },
  instagram: {
    nicht_eingerichtet: "Wir richten den Instagram-Zugang gerade ein. Du hörst von uns, sobald er steht.",
    nur_eingeladene:
      "Instagram prüft unsere App noch. Wir laden dich als Tester ein — die Einladung nimmst du unter instagram.com/accounts/manage_access an, danach kannst du verbinden. Dein Konto muss ein Creator- oder Business-Konto sein.",
    offen: "Ein Klick, Instagram fragt nach deiner Zustimmung, fertig.",
  },
};

export function plattformBereitschaft(platform: PublishPlatform): PlattformBereitschaft {
  const eingerichtet = istEingerichtet(platform);
  const freigegeben = istFreigegeben(FREIGABE_SCHALTER[platform]);

  const bereitschaft: Bereitschaft = !eingerichtet
    ? "nicht_eingerichtet"
    : freigegeben
      ? "offen"
      : "nur_eingeladene";

  return {
    bereitschaft,
    // Ohne eingerichtete App führt der Link nur in eine Fehlermeldung.
    href: eingerichtet ? `/api/oauth/${OAUTH_PFAD[platform]}/authorize` : null,
    hinweis: HINWEISE[platform][bereitschaft],
  };
}

const FREIGABE_SCHALTER: Record<PublishPlatform, string> = {
  youtube: "GOOGLE_APP_LIVE",
  tiktok: "TIKTOK_APP_LIVE",
  instagram: "IG_APP_LIVE",
};

/** Google heißt in der Route „google", die Plattform aber „youtube". */
const OAUTH_PFAD: Record<PublishPlatform, string> = {
  youtube: "google",
  tiktok: "tiktok",
  instagram: "instagram",
};

function istEingerichtet(platform: PublishPlatform): boolean {
  if (platform === "youtube") {
    const c = googleConfig();
    return Boolean(c.clientId && c.clientSecret && c.redirectUri);
  }
  if (platform === "tiktok") {
    const c = tiktokConfig();
    return Boolean(c.clientKey && c.clientSecret && c.redirectUri);
  }
  const c = instagramConfig();
  return Boolean(c.appId && c.appSecret && c.redirectUri);
}
