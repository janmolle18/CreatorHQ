import "server-only";
import { erzeugeToken } from "./email-tokens";
import { mailKonfiguriert, sendeMail } from "./mail";

// Die zwei Mails, die den Zugang tragen. Bewusst hier gebündelt und nicht in
// den Server Actions verstreut: Wortlaut und Ablauf gehören zusammen.

function basis(): string {
  const url = process.env.APP_BASE_URL?.trim();
  if (!url) throw new Error("APP_BASE_URL fehlt — Links in Mails wären unbrauchbar");
  return url.replace(/\/+$/, "");
}

/**
 * Darf ohne Mailversand registriert werden?
 *
 * In der Entwicklung ja — sonst könnte man lokal kein Konto anlegen. In der
 * Produktion NEIN: Dort ist ein fehlender Mailversand ein Konfigurationsfehler,
 * und stillschweigend jeden als bestätigt durchzuwinken wäre genau das Loch,
 * das die Bestätigung schließen soll.
 */
export function ohneMailErlaubt(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function sendeBestaetigung(userId: string, email: string): Promise<void> {
  const token = await erzeugeToken(userId, "verify");
  await sendeMail({
    an: email,
    betreff: "Bestätige deine Adresse für CreatorHQ",
    text: [
      "Willkommen bei CreatorHQ.",
      "",
      "Bestätige deine Adresse mit diesem Link:",
      `${basis()}/bestaetigen/${token}`,
      "",
      "Der Link gilt sieben Tage.",
      "",
      "Wenn du dich nicht angemeldet hast, ignoriere diese Mail — ohne den",
      "Link passiert nichts.",
    ].join("\n"),
  });
}

export async function sendePasswortLink(userId: string, email: string): Promise<void> {
  const token = await erzeugeToken(userId, "reset");
  await sendeMail({
    an: email,
    betreff: "Neues Passwort für CreatorHQ",
    text: [
      "Du kannst hier ein neues Passwort setzen:",
      `${basis()}/passwort/neu/${token}`,
      "",
      "Der Link gilt eine Stunde und nur einmal.",
      "",
      "Wenn du das nicht angefordert hast, ignoriere diese Mail. Dein",
      "bisheriges Passwort bleibt gültig — wir fragen dich nie danach.",
    ].join("\n"),
  });
}

export { mailKonfiguriert };
