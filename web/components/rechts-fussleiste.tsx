import Link from "next/link";
import { supportAdresse } from "@/lib/betreiber";

/**
 * Fußleiste mit den Pflichtangaben.
 *
 * Muss auf jeder öffentlich erreichbaren Seite stehen: Ein Impressum, das man
 * nur über die Adresszeile findet, gilt als nicht „leicht erkennbar" im Sinne
 * des § 5 DDG. Google und Meta suchen bei ihrer Prüfung ebenfalls danach.
 */
export function RechtsFussleiste() {
  const support = supportAdresse();

  return (
    <footer className="mt-16 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-6 text-xs text-ink-faint">
      <Link href="/rechtliches/impressum" className="underline-offset-4 hover:text-ink hover:underline">
        Impressum
      </Link>
      <Link href="/rechtliches/datenschutz" className="underline-offset-4 hover:text-ink hover:underline">
        Datenschutz
      </Link>
      <Link href="/rechtliches/agb" className="underline-offset-4 hover:text-ink hover:underline">
        AGB
      </Link>
      {support && (
        <a href={`mailto:${support}`} className="underline-offset-4 hover:text-ink hover:underline">
          Hilfe
        </a>
      )}
    </footer>
  );
}
