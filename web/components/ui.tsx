import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import type { StatusMeta } from "@/lib/status";

// Selbstgebaute typografische Primitive — keine Component-Library, keine Icons.
//
// Layout-Regel für Zeilen (gilt überall, ist bewusst KEINE Komponente, weil
// Tailwind keine Klassen aus dynamischen Strings erzeugt): eine Zeile ist
// einspaltig und bekommt ihre festen Spalten erst ab `md:`. Also
//   `grid gap-x-6 gap-y-2 md:grid-cols-[150px_1fr]`
// statt `flex` mit `w-32 shrink-0` — Letzteres bricht auf dem Handy.
// Textspalten immer mit `min-w-0`, Bilder immer mit `max-w-…`.

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="tritt-auf mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-hairline pb-6">
      <div>
        {kicker && (
          <p className="timecode mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            {kicker}
          </p>
        )}
        {/* Deutlicher Größensprung zum Nebentext — die Hierarchie trägt die
            Seite, nicht Rahmen und Linien. */}
        <h1 className="text-[2rem] font-bold md:text-5xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-xl text-sm text-ink-soft">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    // Kurze Akzentmarke links statt einer Linie über die volle Breite: Sie
    // markiert den Anfang, ohne den Blick quer über die Seite zu ziehen.
    <h2 className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
      <span aria-hidden="true" className="h-3.5 w-[3px] rounded-full bg-accent" />
      {children}
    </h2>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="py-5 pr-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </p>
      <p className="timecode mt-2 text-4xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

/**
 * `cards`: Auf dem Handy wird die Tabelle zur Kartenliste, statt seitwärts
 * zu scrollen. Voraussetzung ist, dass die Zellen ein `label` mitgeben —
 * deshalb bewusst opt-in und nicht der Standard.
 */
export function Table({
  head,
  cards = false,
  children,
}: {
  head: string[];
  cards?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cards ? "" : "overflow-x-auto"}>
      {/* zeilen-hover: Die Zeile unter dem Zeiger hebt sich ab. In langen
          Tabellen ist das der Unterschied zwischen Lesen und Suchen. */}
      <table
        className={`zeilen-hover w-full border-collapse text-sm ${cards ? "table-cards" : ""}`}
      >
        <thead>
          <tr className="border-b border-hairline">
            {head.map((label, index) => (
              <th
                key={label || `spalte-${index}`}
                scope="col"
                className="py-2 pr-6 text-left text-label font-medium uppercase tracking-[0.18em] text-ink-faint"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  label,
  className = "",
}: {
  children?: ReactNode;
  /** Spaltenname für die Kartenansicht auf dem Handy (siehe Table `cards`). */
  label?: string;
  className?: string;
}) {
  return (
    <td data-label={label} className={`py-3 pr-6 align-top ${className}`}>
      {children}
    </td>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flaeche px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export type ButtonVariant = "primary" | "ghost" | "danger";

/**
 * Die Knopf-Optik als Funktion, damit ConfirmButton, SubmitButton und
 * knopfähnliche Links dieselbe Quelle benutzen. Vorher war sie an drei
 * Stellen nachgebaut — mit auseinanderlaufenden Hover-Tönen.
 *
 * Klare Aktions-Hierarchie: primär = HELL gefüllt, sekundär = erhöhte Fläche,
 * destruktiv = rot gerahmt.
 *
 * Warum die Haupt-Handlung hell ist und nicht violett: Ein violetter Knopf mit
 * heller Schrift kommt auf 3,8:1 Kontrast und liegt damit unter der Norm. Hell
 * auf dunkel erreicht 16:1 — und ist auf dunklem Grund zugleich das Auffälligste,
 * was es gibt. Das Violett bleibt dem Signal vorbehalten (Fokus, „läuft gerade",
 * aktiver Menüpunkt) und wird dadurch überhaupt erst lesbar als Signal.
 */
export function buttonClasses(variant: ButtonVariant = "primary", extra = ""): string {
  const styles =
    variant === "primary"
      ? "bg-ink text-paper hover:bg-white"
      : variant === "danger"
        ? "border border-err/40 text-err hover:border-err hover:bg-err/[0.08]"
        : "border border-feldrand bg-raised text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] hover:bg-hairline hover:border-ink-faint";
  // `knopf` bringt das Verhalten mit (Heben, Glanz, Druckpunkt, Laufbalken) —
  // siehe globals.css. Hier stehen nur noch Maße und Farbe.
  return `knopf inline-flex min-h-11 select-none items-center justify-center rounded-lg px-4 text-meta font-medium tracking-wide disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}

/**
 * Textknopf für Nebenaktionen („Erneut clippen", „Verwerfen"). War bisher an
 * sechs Stellen nachgebaut. Die Mindesthöhe macht ihn auf dem Handy treffbar.
 */
export function TextButton({
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`group/tb -mx-2 inline-flex min-h-11 items-center px-2 text-label font-medium uppercase tracking-[0.14em] text-ink-soft transition-colors duration-150 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      <span className="relative">
        {children}
        {/* Der Unterstrich wächst aus der Mitte, statt schlagartig da zu sein —
            über scaleX, damit kein Umbruch neu gerechnet wird. Bei reduzierter
            Bewegung steht er ohne Übergang sofort. */}
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 left-0 h-px w-full origin-center scale-x-0 bg-current transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/tb:scale-x-100 motion-reduce:transition-none"
        />
      </span>
    </button>
  );
}

const STATUS_COLOR = {
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  muted: "text-ink-faint",
} as const;

export function StatusText({
  tone,
  children,
}: {
  tone: keyof typeof STATUS_COLOR;
  children: ReactNode;
}) {
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${STATUS_COLOR[tone]}`}
    >
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

// Auf dunklem Grund reicht ein Unterstrich nicht: Das Feld braucht eine eigene
// Fläche, sonst ist nicht erkennbar, wo man hineinschreiben kann.
//
// Der Rahmen ist --color-feldrand und NICHT hairline: hairline ist eine
// Trennlinie und kommt gegen paper auf 1,36:1 — die Norm verlangt fuer die
// Grenze eines Bedienelements 3:1. Mit hairline war das Feld vom Seitengrund
// praktisch nicht zu unterscheiden.
//
// `focus:outline-none` ist bewusst NICHT mehr da: Es lag in Tailwinds
// utilities-Layer und schlug damit die globale Fokusregel aus @layer base —
// der Akzent-Ring war an jedem Feld weg. Der weiche Schein bleibt als
// Zugabe, tragen muss ihn die Outline.
//
// Beim Hineinschreiben legt sich ein Akzent-Ring um das Feld. Das ist bewusst
// ein `box-shadow` und keine `border`: Eine wachsende Rahmenbreite würde das
// Feld um zwei Pixel verschieben und die ganze Zeile neu umbrechen lassen.
const FIELD_BASE =
  "w-full rounded-lg border border-feldrand bg-panel px-3 py-2.5 text-[15px] text-ink shadow-[0_0_0_0_rgb(124_92_255/0)] transition-[border-color,box-shadow] duration-200 placeholder:text-ink-faint hover:border-ink-faint focus:border-accent focus:shadow-[0_0_0_3px_rgb(124_92_255/0.18)]";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_BASE} resize-y leading-relaxed ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_BASE} ${className}`} {...props} />;
}

/** Beschriftete Auswahlgruppe — mit fieldset/legend statt loser Absatz-Überschrift. */
export function CheckboxGroup({
  legend,
  children,
  className = "",
}: {
  legend: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-label font-medium uppercase tracking-[0.18em] text-ink-faint">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
    </fieldset>
  );
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-meta">
      <input type="checkbox" className="size-4 accent-ink" {...props} />
      {label}
    </label>
  );
}

/** Abgesetzte Fläche für gruppierte Inhalte — bewusst flach, nur Haarlinie. */
export function Card({
  children,
  className = "",
  anfassbar = false,
}: {
  children: ReactNode;
  className?: string;
  /** Hinter der Karte steckt eine Handlung — dann hebt sie sich beim Zeigen. */
  anfassbar?: boolean;
}) {
  return (
    <div className={`flaeche p-5 ${anfassbar ? "zieht-an" : ""} ${className}`}>{children}</div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-raised px-2 py-0.5 text-label uppercase tracking-[0.14em] text-ink-soft">
      {children}
    </span>
  );
}

/** Status aus der Registry (web/lib/status.ts) — nie roh aus der Datenbank. */
export function Status({ meta }: { meta: StatusMeta }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <StatusText tone={meta.tone}>{meta.label}</StatusText>
      {meta.hint && <span className="text-xs text-ink-soft">{meta.hint}</span>}
    </span>
  );
}

/** Platzhalter für Inhalte, die gerade entstehen (z. B. noch nicht fertiges Video). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-hairline/60 ${className}`} aria-hidden="true" />;
}
