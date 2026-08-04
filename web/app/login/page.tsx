import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Button, Input, StatusText } from "@/components/ui";
import { RechtsFussleiste } from "@/components/rechts-fussleiste";
import { loginAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  // Bewusst dieselbe Meldung für falsches Passwort und unbekannte Adresse:
  // Sonst ließe sich von außen abfragen, wer hier ein Konto hat.
  invalid: "E-Mail-Adresse oder Passwort stimmt nicht.",
  rate: "Zu viele Versuche. Bitte 15 Minuten warten.",
  "kein-zugang": "Zu diesem Konto gehört noch kein Kanal. Melde dich bei uns.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "Anmeldung fehlgeschlagen." : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Aus deinen Videos werden Clips
        </p>
        <h1 className="mt-2 text-5xl font-bold tracking-tight">CreatorHQ</h1>

        <form action={loginAction} className="mt-12 space-y-6">
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
              autoComplete="current-password"
              placeholder="••••••••••••"
            />
          </div>
          {errorMessage && <StatusText tone="err">{errorMessage}</StatusText>}
          <Button type="submit" className="w-full">
            Anmelden
          </Button>
        </form>

        <p className="mt-8 text-sm text-ink-faint">
          Noch kein Konto?{" "}
          <Link href="/registrieren" className="font-medium text-ink underline">
            Kanal anlegen
          </Link>
        </p>
        <RechtsFussleiste />
      </div>
    </main>
  );
}
