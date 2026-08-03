import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { logoutAction } from "@/app/login/actions";

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

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:grid md:grid-cols-[230px_1fr]">
      <aside className="flex flex-col border-b border-hairline px-6 py-6 md:sticky md:top-0 md:h-screen md:justify-between md:border-b-0 md:border-r md:py-10">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline bg-ink text-sm font-semibold text-paper"
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
            {NAV_VERWALTUNG.map((item) => (
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
              {NAV_VERWALTUNG.map((item) => (
                <NavLink key={item.href} {...item} orientation="horizontal" />
              ))}
            </div>
          </nav>
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
  );
}
