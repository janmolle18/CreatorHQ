import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Button, StatusText } from "@/components/ui";
import { logoutAction, sendeBestaetigungErneutAction } from "../login/actions";

export const dynamic = "force-dynamic";

const MELDUNGEN: Record<string, { text: string; tone: "ok" | "err" }> = {
  rate: { text: "Zu viele Anfragen. Bitte ein paar Minuten warten.", tone: "err" },
  versand: {
    text: "Die Mail ließ sich gerade nicht verschicken. Bitte gleich noch einmal versuchen.",
    tone: "err",
  },
};

export default async function BestaetigenPage({
  searchParams,
}: {
  searchParams: Promise<{ gesendet?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Wer schon bestätigt ist, hat hier nichts verloren.
  if (session.emailVerified) redirect("/");

  const { gesendet, error } = await searchParams;
  const meldung = gesendet
    ? { text: "Mail ist raus. Schau auch im Spam nach.", tone: "ok" as const }
    : error
      ? (MELDUNGEN[error] ?? { text: error, tone: "err" as const })
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <p className="timecode text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Fast fertig
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Bestätige deine Adresse</h1>

        <p className="mt-4 text-sm text-ink-soft">
          Wir haben dir eine Mail an{" "}
          <strong className="font-medium text-ink">{session.email}</strong> geschickt. Ein
          Klick auf den Link darin schaltet dein Konto frei.
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          Nichts angekommen? Manchmal landet die erste Mail im Spam. Sonst schicken wir
          sie noch einmal.
        </p>

        {meldung && (
          <p className="mt-6">
            <StatusText tone={meldung.tone}>{meldung.text}</StatusText>
          </p>
        )}

        <form action={sendeBestaetigungErneutAction} className="mt-8">
          <Button type="submit" variant="ghost">
            Mail noch einmal senden
          </Button>
        </form>

        <div className="mt-10 flex items-center gap-5 text-sm text-ink-faint">
          <form action={logoutAction}>
            <button type="submit" className="underline underline-offset-4 hover:text-ink">
              Abmelden
            </button>
          </form>
          <Link href="/passwort" className="underline underline-offset-4 hover:text-ink">
            Falsche Adresse angegeben?
          </Link>
        </div>
      </div>
    </main>
  );
}
