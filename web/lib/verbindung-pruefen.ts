import "server-only";
import type { SocialAccount } from "@creatorhq/db";
import { decryptSecret } from "@creatorhq/shared";
import { YOUTUBE_SCOPES } from "./google";
import { TIKTOK_SCOPES } from "./tiktok";
import { IG_SCOPES } from "./instagram";

/**
 * Beantwortet die eine Frage, die „Verbunden" offen lässt:
 * **Geht das Hochladen jetzt auch wirklich?**
 *
 * „Verbunden" heisst nur, dass irgendwann ein Token angekommen ist. Es sagt
 * nichts darüber, ob die Berechtigung zum Hochladen dabei war, ob das Token
 * noch gilt, oder ob der Creator versehentlich das falsche Konto ausgewählt
 * hat. Genau diese drei Dinge scheitern in der Praxis — und zwar erst dann,
 * wenn das erste Video rausgehen soll.
 *
 * Deshalb wird hier die Plattform tatsächlich gefragt, nicht die eigene
 * Datenbank. Ein Test, der nur die eigene Tabelle liest, prüft nichts.
 */

export interface Pruefergebnis {
  /** Geht ein Upload? Das ist die Antwort, auf die es ankommt. */
  bereit: boolean;
  /** Ein Satz Klartext — was der Creator jetzt weiss. */
  befund: string;
  /** Welches Konto die Plattform zurückmeldet — gegen „falscher Kanal". */
  konto?: string;
  /** Was zu tun ist, wenn es nicht bereit ist. */
  naechsterSchritt?: string;
}

/** Berechtigungen, ohne die ein Upload garantiert scheitert. */
const PFLICHT: Record<string, readonly string[]> = {
  youtube: ["https://www.googleapis.com/auth/youtube.upload"],
  tiktok: ["video.publish"],
  instagram: ["instagram_business_content_publish"],
};

const ALLE_SCOPES: Record<string, readonly string[]> = {
  youtube: YOUTUBE_SCOPES,
  tiktok: TIKTOK_SCOPES,
  instagram: IG_SCOPES,
};

/**
 * Fehlende Berechtigungen — rein aus dem, was bei der Zustimmung zurückkam.
 *
 * Bewusst getrennt von der Netzabfrage: Wenn hier schon etwas fehlt, braucht
 * es gar keinen Anruf bei der Plattform. Und der Creator erfährt den Grund,
 * statt nur „geht nicht".
 */
export function fehlendeBerechtigungen(platform: string, erteilte: string[]): string[] {
  const pflicht = PFLICHT[platform] ?? [];
  const vorhanden = new Set(erteilte);
  return pflicht.filter((noetig) => !vorhanden.has(noetig));
}

/** Kennt die Plattform dieses Konto noch? Frist von 5 s, damit die Seite nicht hängt. */
async function frage(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
}

async function pruefeYoutube(token: string): Promise<Pruefergebnis> {
  // Genau der Aufruf, den auch der Upload braucht — nur lesend. Wer hier eine
  // Antwort bekommt, dessen Token gilt und dessen Kanal existiert.
  const res = await frage(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,status&mine=true",
    token
  );
  if (res.status === 401) {
    return {
      bereit: false,
      befund: "YouTube erkennt den Zugang nicht mehr.",
      naechsterSchritt: "Einmal neu verbinden — das dauert einen Klick.",
    };
  }
  if (!res.ok) {
    return {
      bereit: false,
      befund: `YouTube antwortet gerade nicht (${res.status}).`,
      naechsterSchritt: "Später erneut prüfen. Liegt es an uns, sehen wir es im Protokoll.",
    };
  }
  const daten = (await res.json()) as {
    items?: Array<{ snippet?: { title?: string }; status?: { longUploadsStatus?: string } }>;
  };
  const kanal = daten.items?.[0];
  if (!kanal) {
    return {
      bereit: false,
      befund: "Zu diesem Google-Konto gehört kein YouTube-Kanal.",
      naechsterSchritt:
        "Neu verbinden und dabei das Konto wählen, unter dem dein Kanal läuft — nicht die private Adresse.",
    };
  }
  return {
    bereit: true,
    befund: "YouTube nimmt Uploads von uns an.",
    konto: kanal.snippet?.title,
  };
}

async function pruefeTiktok(token: string): Promise<Pruefergebnis> {
  const res = await frage(
    "https://open.tiktokapis.com/v2/user/info/?fields=display_name",
    token
  );
  if (res.status === 401) {
    return {
      bereit: false,
      befund: "TikTok erkennt den Zugang nicht mehr.",
      naechsterSchritt: "Einmal neu verbinden.",
    };
  }
  if (!res.ok) {
    return { bereit: false, befund: `TikTok antwortet gerade nicht (${res.status}).` };
  }
  const daten = (await res.json()) as { data?: { user?: { display_name?: string } } };
  return {
    bereit: true,
    befund: "TikTok nimmt Videos von uns an.",
    konto: daten.data?.user?.display_name,
  };
}

async function pruefeInstagram(token: string): Promise<Pruefergebnis> {
  const res = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=username&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(5000), cache: "no-store" }
  );
  if (!res.ok) {
    return {
      bereit: false,
      befund:
        res.status === 401 || res.status === 400
          ? "Instagram erkennt den Zugang nicht mehr."
          : `Instagram antwortet gerade nicht (${res.status}).`,
      naechsterSchritt: res.status < 500 ? "Einmal neu verbinden." : undefined,
    };
  }
  const daten = (await res.json()) as { username?: string };
  return { bereit: true, befund: "Instagram nimmt Reels von uns an.", konto: daten.username };
}

/**
 * Prüft ein verbundenes Konto — erst die Berechtigungen, dann die Plattform.
 *
 * Wirft nicht: Ein fehlgeschlagener Test ist ein Befund, kein Absturz. Die
 * Seite soll ihn anzeigen, nicht daran zerbrechen.
 */
export async function pruefeVerbindung(konto: SocialAccount): Promise<Pruefergebnis> {
  if (konto.status !== "connected" || !konto.accessTokenEnc) {
    return { bereit: false, befund: "Noch nicht verbunden." };
  }

  const fehlt = fehlendeBerechtigungen(konto.platform, konto.scopes ?? []);
  if (fehlt.length > 0) {
    return {
      bereit: false,
      befund: "Beim Zustimmen fehlte die Berechtigung zum Hochladen.",
      naechsterSchritt:
        "Neu verbinden und im Zustimmungsfenster ALLE Haken stehen lassen — ohne den Upload-Haken kommt kein Video durch.",
    };
  }

  try {
    const token = decryptSecret(konto.accessTokenEnc);
    if (konto.platform === "youtube") return await pruefeYoutube(token);
    if (konto.platform === "tiktok") return await pruefeTiktok(token);
    if (konto.platform === "instagram") return await pruefeInstagram(token);
    return { bereit: false, befund: "Unbekannte Plattform." };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    // Eine Zeitüberschreitung ist etwas anderes als ein kaputter Zugang —
    // sonst schickt der Hinweis den Creator grundlos ins Neuverbinden.
    const zeitraus = /timeout|aborted/i.test(grund);
    return {
      bereit: false,
      befund: zeitraus
        ? "Die Plattform hat nicht rechtzeitig geantwortet."
        : `Prüfung fehlgeschlagen: ${grund.slice(0, 100)}`,
      naechsterSchritt: zeitraus ? "Gleich noch einmal versuchen." : undefined,
    };
  }
}

/** Zeigt alle Scopes, die wir anfragen — für die Anzeige auf /system. */
export function angefragteBerechtigungen(platform: string): readonly string[] {
  return ALLE_SCOPES[platform] ?? [];
}
