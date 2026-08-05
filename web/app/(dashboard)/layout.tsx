import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { RechtsFussleiste } from "@/components/rechts-fussleiste";
import { supportAdresse } from "@/lib/betreiber";
import { logoutAction } from "@/app/login/actions";
import { verlasseKanalAction } from "@/app/(dashboard)/zentrale/actions";
import { SubmitButton } from "@/components/submit-button";

// Alltag zuerst, Verwaltung abgesetzt darunter. Die Reihenfolge folgt dem
// Tagesablauf eines Creators: Was ist zu tun → posten → entscheiden → nachsehen.
const NAV_ALLTAG = [
  { href: "/", label: "Übersicht" },
  { href: "/posts", label: "Posten" },
  { href: "/clips", label: "Clips" },
  { href: "/sources", label: "Quellen" },
  { href: "/briefing", label: "Briefing" },
  { href: "/planning", label: "Ideen" },
  { href: "/calendar", label: "Kalender" },
];

const NAV_VERWALTUNG = [
  { href: "/analytics", label: "Zahlen" },
  { href: "/verbinden", label: "Verbinden" },
  { href: "/accounts", label: "Konten" },
  { href: "/settings", label: "Einstellungen" },
  { href: "/system", label: "System" },
];

/** Anfangsbuchstaben als Platzhalter, solange kein Profilbild hinterlegt ist. */
function initialen(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((teil) => teil[0]!.toUpperCase())
    .join("");
}

/**
 * Warnband, solange ein Betreiber im Kanal eines Kunden arbeitet.
 *
 * Bewusst laut und ganz oben, über allem: Der gefährliche Fehler ist nicht,
 * hineinzukommen — sondern zu vergessen, dass man drin ist, und im Namen
 * eines Kunden zu veröffentlichen.
 */
function FremderKanalBand({ kanal }: { kanal: string }) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-warn px-6 py-2.5 text-paper">
      <p className="text-meta font-semibold">
        Du arbeitest im Kanal <span className="underline underline-offset-4">{kanal}</span> — alles,
        was du hier tust, geschieht in dessen Namen.
      </p>
      <form action={verlasseKanalAction}>
        <SubmitButton variant="ghost" pendingLabel="…" className="!min-h-9 !bg-paper/15 !text-paper">
          Verlassen
        </SubmitButton>
      </form>
    </div>
  );
}

/**
 * Band für einen gesperrten Kanal.
 *
 * Es steht dauerhaft oben, nicht als Meldung nach einem Klick: Ein Creator,
 * der nicht weiss, warum nichts rausgeht, sucht den Fehler bei sich und
 * schreibt irgendwann verärgert — oder gar nicht und kündigt.
 *
 * Der Ton ist bewusst nicht rot: Nichts ist kaputt, und die Daten sind alle
 * da. Es fehlt eine Zahlung.
 */
function GesperrtBand() {
  const hilfe = supportAdresse();
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-warn/30 bg-warn/[0.12] px-6 py-2.5">
      <p className="text-meta text-ink">
        <span className="font-semibold text-warn">Dein Kanal ist gesperrt.</span> Es geht gerade
        nichts raus — deine Clips, Zahlen und Termine bleiben aber vollständig da.
      </p>
      {hilfe && (
        <a
          href={`mailto:${hilfe}?subject=${encodeURIComponent("Kanal wieder freischalten")}`}
          className="text-meta font-medium text-ink underline underline-offset-4 hover:text-warn"
        >
          Freischaltung klären
        </a>
      )}
    </div>
  );
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const navVerwaltung = session.isPlatformAdmin
    ? [{ href: "/zentrale", label: "Zentrale" }, ...NAV_VERWALTUNG]
    : NAV_VERWALTUNG;

  return (
    <>
      {session.alsAdminImFremdenKanal && <FremderKanalBand kanal={session.tenantName} />}
      {!session.darfPosten && <GesperrtBand />}
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:grid md:grid-cols-[230px_1fr]">
      <aside className="flex flex-col border-b border-hairline px-6 py-6 md:sticky md:top-0 md:h-screen md:justify-between md:border-b-0 md:border-r md:py-10">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-sm font-semibold text-accent-text shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
            >
              {initialen(session.tenantName)}
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold leading-tight tracking-tight">
                CreatorHQ
              </span>
              <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                {session.tenantName}
              </span>
            </span>
          </Link>

          <nav className="mt-10 hidden flex-col gap-1 md:flex" aria-label="Hauptnavigation">
            {NAV_ALLTAG.map((item) => (
              <NavLink key={item.href} {...item} orientation="vertical" />
            ))}
            <span className="my-3 border-t border-hairline" aria-hidden="true" />
            {navVerwaltung.map((item) => (
              <NavLink key={item.href} {...item} orientation="vertical" />
            ))}
          </nav>

          {/* Handy: zwei Zeilen statt einer seitwärts scrollenden Leiste —
              vorher lagen die hinteren Punkte außerhalb des Sichtbereichs. */}
          <nav className="mt-5 md:hidden" aria-label="Hauptnavigation">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {NAV_ALLTAG.map((item) => (
                <NavLink key={item.href} {...item} orientation="horizontal" />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline pt-2">
              {navVerwaltung.map((item) => (
                <NavLink key={item.href} {...item} orientation="horizontal" />
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-6 md:mt-0">
          <RechtsFussleiste />
        </div>

        <form action={logoutAction} className="mt-6 md:mt-0">
          <button
            type="submit"
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
          >
            Abmelden
          </button>
        </form>
      </aside>

      <main className="px-6 py-10 md:px-12 md:py-12">{children}</main>
    </div>
    </>
  );
}
