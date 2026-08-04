import Link from "next/link";
import { Button, Input, StatusText } from "@/components/ui";
import { setzePasswortAction } from "../../../login/actions";

export const dynamic = "force-dynamic";

/**
 * Neues Passwort setzen.
 *
 * Das Token wird hier NICHT geprüft, sondern erst beim Absenden eingelöst —
 * es gilt genau einmal. Würde die Seite es zum Anzeigen verbrauchen, wäre es
 * beim Absenden schon verfallen, und jede Mail-Vorschau des Anbieters würde
 * den Link im Vorbeigehen entwerten.
 */
export default async function NeuesPasswortPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="timecode text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Zugang wiederherstellen
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Neues Passwort setzen</h1>

        <form action={setzePasswortAction} className="mt-8 space-y-6">
          <input type="hidden" name="token" value={token} />
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint"
            >
              Neues Passwort
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={12}
              autoFocus
              autoComplete="new-password"
              placeholder="mindestens 12 Zeichen"
            />
            <p className="mt-1 text-xs text-ink-faint">
              Mindestens 12 Zeichen. Lieber drei Wörter als ein kurzes Kryptisches.
            </p>
          </div>
          {error && <StatusText tone="err">{error}</StatusText>}
          <Button type="submit" className="w-full">
            Passwort speichern
          </Button>
        </form>

        <p className="mt-8 text-sm text-ink-faint">
          <Link href="/login" className="underline underline-offset-4 hover:text-ink">
            Zurück zur Anmeldung
          </Link>
        </p>
      </div>
    </main>
  );
}
