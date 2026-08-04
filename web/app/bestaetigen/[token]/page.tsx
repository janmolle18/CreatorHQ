import Link from "next/link";
import { db, users } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import { loeseTokenEin } from "@/lib/email-tokens";
import { StatusText } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Bestätigungslink aus der Mail.
 *
 * Bewusst OHNE Anmeldung erreichbar: Der Link wird oft auf dem Handy geöffnet,
 * während man sich am Rechner registriert hat. Das Token selbst ist der
 * Nachweis — es ist einmalig, läuft ab, und in der Datenbank steht nur sein
 * Hash.
 */
export default async function BestaetigenTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const eingeloest = await loeseTokenEin(decodeURIComponent(token), "verify");

  if (eingeloest) {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, eingeloest.userId));
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {eingeloest ? (
          <>
            <p className="timecode text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Erledigt
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">Adresse bestätigt</h1>
            <p className="mt-4 text-sm text-ink-soft">
              Dein Konto ist freigeschaltet. Als Nächstes verbindest du deine Kanäle — das
              sind drei Klicks und kostet kein einziges Passwort.
            </p>
            <Link
              href="/verbinden"
              className="mt-8 inline-block rounded-lg bg-ink px-5 py-2.5 text-[13px] font-medium tracking-wide text-paper transition-colors hover:bg-white"
            >
              Weiter zum Verbinden
            </Link>
          </>
        ) : (
          <>
            <p className="timecode text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Link nicht mehr gültig
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">Das hat nicht geklappt</h1>
            <p className="mt-4 text-sm text-ink-soft">
              Der Link ist abgelaufen oder wurde schon benutzt. Beides ist normal — melde
              dich an, dann schicken wir dir einen neuen.
            </p>
            <p className="mt-3">
              <StatusText tone="muted">
                Ein Bestätigungslink gilt sieben Tage und genau einmal.
              </StatusText>
            </p>
            <Link
              href="/login"
              className="mt-8 inline-block rounded-lg bg-ink px-5 py-2.5 text-[13px] font-medium tracking-wide text-paper transition-colors hover:bg-white"
            >
              Zur Anmeldung
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
