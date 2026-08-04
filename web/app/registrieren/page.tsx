import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Button, Input, StatusText } from "@/components/ui";
import { RechtsFussleiste } from "@/components/rechts-fussleiste";
import { registerAction } from "../login/actions";

export default async function RegistrierenPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;
  // Die Meldungen kommen fertig formuliert aus der Prüfung der Eingabe.
  const fehler = error === "rate" ? "Zu viele Versuche. Bitte kurz warten." : error;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Kostenlos starten
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Kanal anlegen</h1>
        <p className="mt-3 text-sm text-ink-faint">
          Danach verbindest du deine Konten — das dauert drei Klicks und braucht
          kein einziges Passwort von dir.
        </p>

        <form action={registerAction} className="mt-10 space-y-6">
          <div>
            <label
              htmlFor="creatorName"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint"
            >
              Kanalname
            </label>
            <Input
              id="creatorName"
              name="creatorName"
              required
              autoFocus
              maxLength={120}
              placeholder="Dein Kanal"
            />
          </div>
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
              autoComplete="email"
              placeholder="du@beispiel.de"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint"
            >
              Passwort
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              placeholder="mindestens 12 Zeichen"
            />
            <p className="mt-1 text-xs text-ink-faint">
              Mindestens 12 Zeichen. Lieber drei Wörter als ein kurzes Kryptisches.
            </p>
          </div>
          {fehler && <StatusText tone="err">{fehler}</StatusText>}
          <Button type="submit" className="w-full">
            Kanal anlegen
          </Button>
        </form>

        <p className="mt-8 text-sm text-ink-faint">
          Schon dabei?{" "}
          <Link href="/login" className="font-medium text-ink underline">
            Anmelden
          </Link>
        </p>
        <RechtsFussleiste />
      </div>
    </main>
  );
}
