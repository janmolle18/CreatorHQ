import "server-only";

// Mailversand.
//
// Anbieter ist Brevo (Frankreich, also EU) — dieselbe Begründung wie beim
// Hosting: Wir verkaufen „keine Daten außerhalb der EU", dann darf die
// Bestätigungsmail nicht über einen US-Dienst laufen.
//
// Die Schnittstelle ist bewusst schmal, damit ein Anbieterwechsel eine Datei
// kostet und keinen Umbau.

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export interface Mail {
  an: string;
  betreff: string;
  /** Reiner Text. Kein HTML — Bestätigungsmails brauchen keins, und
   *  Textmails landen seltener im Spam. */
  text: string;
}

export function mailKonfiguriert(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

/**
 * Verschickt eine Mail. Wirft, wenn es nicht geklappt hat.
 *
 * Bewusst werfend und nicht „gibt false zurück": Eine Bestätigungsmail, die
 * still nicht ankommt, sperrt den Kunden aus seinem gerade angelegten Konto
 * aus — und niemand merkt es, bis er sich beschwert.
 */
export async function sendeMail(mail: Mail): Promise<void> {
  const key = process.env.BREVO_API_KEY?.trim();
  const von = process.env.MAIL_FROM?.trim();
  const absender = process.env.MAIL_FROM_NAME?.trim() || "CreatorHQ";

  if (!key || !von) {
    throw new Error(
      "Mailversand ist nicht eingerichtet (BREVO_API_KEY / MAIL_FROM fehlen)"
    );
  }

  const antwort = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": key,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: von, name: absender },
      to: [{ email: mail.an }],
      subject: mail.betreff,
      textContent: mail.text,
    }),
  });

  if (!antwort.ok) {
    // Den Text der Antwort mitnehmen, aber gekappt: Er kann bei Brevo die
    // Empfängeradresse enthalten, und die gehört nicht unnötig ins Log.
    const grund = (await antwort.text().catch(() => "")).slice(0, 200);
    throw new Error(`Mailversand fehlgeschlagen (${antwort.status}): ${grund}`);
  }
}
