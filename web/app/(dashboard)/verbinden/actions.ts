"use server";

import { socialAccounts } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PUBLISH_PLATFORMS } from "@creatorhq/shared";
import { mitMandant } from "@/lib/auth";
import { pruefeVerbindung } from "@/lib/verbindung-pruefen";
import { logger } from "@/lib/logger";

const schema = z.object({ platform: z.enum(PUBLISH_PLATFORMS) });

/**
 * Fragt die Plattform, ob das Hochladen jetzt wirklich geht.
 *
 * „Verbunden" sagt nur, dass irgendwann ein Token ankam. Ob damit auch ein
 * Video durchgeht, weiss man sonst erst, wenn das erste rausgehen soll — also
 * genau dann, wenn es weh tut.
 *
 * Ein misslungener Test setzt das Konto NICHT auf „abgelaufen": Eine
 * Zeitüberschreitung bei der Plattform ist kein kaputter Zugang, und ein Konto
 * grundlos zu entwerten würde den Creator zu einem Neuverbinden schicken, das
 * gar nichts behebt. Nur ein klares „kennt den Zugang nicht mehr" wird
 * vermerkt — das erledigt der Worker beim nächsten echten Versuch.
 */
export async function pruefeVerbindungAction(formData: FormData): Promise<void> {
  const eingabe = schema.safeParse({ platform: formData.get("platform") ?? "" });
  if (!eingabe.success) redirect("/verbinden?error=" + encodeURIComponent("Unbekannte Plattform"));
  const { platform } = eingabe.data!;

  const ergebnis = await mitMandant(async (tx, session) => {
    const [konto] = await tx
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.platform, platform))
      .limit(1);
    if (!konto) return null;
    const befund = await pruefeVerbindung(konto);
    logger.info(
      { tenantId: session.tenantId, platform, bereit: befund.bereit },
      "Verbindung geprüft"
    );
    return befund;
  });

  if (!ergebnis) {
    redirect("/verbinden?error=" + encodeURIComponent("Für diese Plattform ist nichts verbunden"));
  }

  // Umleitung NACH dem Mandanten-Block — innerhalb würde sie die Transaktion
  // abbrechen (siehe die Warnung an mitMandant).
  const teile = [
    `geprueft=${platform}`,
    `bereit=${ergebnis.bereit ? "1" : "0"}`,
    `befund=${encodeURIComponent(ergebnis.befund)}`,
  ];
  if (ergebnis.konto) teile.push(`konto=${encodeURIComponent(ergebnis.konto)}`);
  if (ergebnis.naechsterSchritt) teile.push(`tun=${encodeURIComponent(ergebnis.naechsterSchritt)}`);
  redirect(`/verbinden?${teile.join("&")}`);
}
