import Link from "next/link";
import type { ReactNode } from "react";

const SEITEN = [
  { href: "/rechtliches/impressum", label: "Impressum" },
  { href: "/rechtliches/datenschutz", label: "Datenschutz" },
  { href: "/rechtliches/agb", label: "AGB" },
];

// Öffentlich erreichbar, auch ohne Anmeldung — Google und Meta prüfen die
// Datenschutzerklärung im Rahmen ihrer Freigabe, und ein Impressum hinter
// einem Login erfüllt seinen Zweck nicht.
export default function RechtlichesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="timecode text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint hover:text-ink"
      >
        CreatorHQ
      </Link>

      <nav className="mt-6 flex gap-6 border-b border-hairline pb-4" aria-label="Rechtliches">
        {SEITEN.map((seite) => (
          <Link
            key={seite.href}
            href={seite.href}
            className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            {seite.label}
          </Link>
        ))}
      </nav>

      <article className="prose-creatorhq mt-10">{children}</article>
    </div>
  );
}
