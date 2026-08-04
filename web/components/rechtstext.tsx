import type { ReactNode } from "react";
import { StatusText } from "./ui";

// Bausteine für die Rechtsseiten. Eigene Komponenten statt Tailwind-Prosa,
// damit alle drei Seiten gleich aussehen und die Abstände einmal festgelegt
// sind.

export function RechtTitel({ children }: { children: ReactNode }) {
  return <h1 className="text-4xl font-bold tracking-tight">{children}</h1>;
}

export function RechtAbschnitt({
  titel,
  children,
}: {
  titel: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{titel}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

/**
 * Hinweis, wenn die Betreiberangaben fehlen.
 *
 * Bewusst sichtbar statt still: Eine Rechtsseite ohne Angaben ist ein Mangel,
 * der auffallen muss — und die Plattform-Prüfungen von Google und Meta sehen
 * genau diese Seite an.
 */
export function AngabenFehlen({ was }: { was: string }) {
  return (
    <div className="flaeche mt-6 border border-warn/40 p-5">
      <StatusText tone="warn">Noch nicht ausgefüllt</StatusText>
      <p className="mt-2 text-sm text-ink-soft">
        Für diese Seite fehlen die Betreiberangaben ({was}). Sie werden über die
        Umgebungsvariablen <code className="text-ink">BETREIBER_*</code> gesetzt — siehe{" "}
        <code className="text-ink">.env.example</code> und{" "}
        <code className="text-ink">docs/betrieb.md</code>.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Solange sie fehlen, ist die Seite unvollständig. Google und Meta prüfen sie im
        Rahmen der App-Freigabe.
      </p>
    </div>
  );
}

/** Markiert Passagen, die vor dem öffentlichen Start juristisch geprüft gehören. */
export function PruefenHinweis({ children }: { children: ReactNode }) {
  return (
    <div className="flaeche mt-8 border border-hairline p-5">
      <StatusText tone="muted">Vor dem öffentlichen Start prüfen lassen</StatusText>
      <p className="mt-2 text-sm text-ink-soft">{children}</p>
    </div>
  );
}
