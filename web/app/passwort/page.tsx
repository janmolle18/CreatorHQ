import Link from "next/link";
import { Button, Input, StatusText } from "@/components/ui";
import { RechtsFussleiste } from "@/components/rechts-fussleiste";
import { requestPasswortResetAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function PasswortVergessenPage({
  searchParams,
}: {
  searchParams: Promise<{ gesendet?: string; error?: string }>;
}) {
  const { gesendet, error } = await searchParams;

  // Nach dem Absenden IMMER dieselbe Antwort — unabhängig davon, ob es die
  // Adresse gibt. Sonst wäre dieses Formular eine Auskunftsstelle darüber,
  // wer hier Kunde ist.
  if (gesendet) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="timecode text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            Mail unterwegs
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Schau ins Postfach</h1>
          <p className="mt-4 text-sm text-ink-soft">
            Falls es zu dieser Adresse ein Konto gibt, liegt dort jetzt ein Link zum
            Zurücksetzen. Er gilt eine Stunde.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block text-sm text-ink-faint underline underline-offset-4 hover:text-ink"
          >
            Zurück zur Anmeldung
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="timecode text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Passwort vergessen
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Neues Passwort</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Gib deine Adresse ein. Wir schicken dir einen Link, mit dem du ein neues
          Passwort setzt.
        </p>

        <form action={requestPasswortResetAction} className="mt-8 space-y-6">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint"
            >
              E-Mail
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="du@beispiel.de"
            />
          </div>
          {error === "rate" && (
            <StatusText tone="err">Zu viele Anfragen. Bitte kurz warten.</StatusText>
          )}
          {error === "abgelaufen" && (
            <StatusText tone="err">
              Der Link war abgelaufen oder schon benutzt. Fordere einen neuen an.
            </StatusText>
          )}
          <Button type="submit" className="w-full">
            Link schicken
          </Button>
        </form>

        <p className="mt-8 text-sm text-ink-faint">
          Doch erinnert?{" "}
          <Link href="/login" className="font-medium text-ink underline">
            Anmelden
          </Link>
        </p>
        <RechtsFussleiste />
      </div>
    </main>
  );
}
