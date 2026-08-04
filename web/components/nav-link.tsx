"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Menüpunkt mit Zustand.
 *
 * Die Akzentmarke des aktiven Punktes fährt aus der Mitte heraus (scaleY)
 * statt einfach da zu sein — das ist der eine Ort im Menü, an dem Farbe
 * auftaucht, und die Bewegung führt den Blick dorthin. Beim Zeigen rückt die
 * Beschriftung zwei Pixel nach, damit auch der inaktive Punkt antwortet.
 *
 * Alles über `transform`: Eine wachsende Rahmenbreite würde die Beschriftung
 * verschieben und bei jedem Zeigen einen Umbruch auslösen.
 */
export function NavLink({
  href,
  label,
  orientation,
}: {
  href: string;
  label: string;
  orientation: "vertical" | "horizontal";
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (orientation === "vertical") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`group/nav relative rounded-r-md py-1.5 pl-4 text-sm transition-colors duration-150 ${
          active
            ? "bg-accent/[0.07] font-medium text-ink"
            : "text-ink-soft hover:bg-raised/60 hover:text-ink"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-[2px] origin-center rounded-full bg-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            active ? "scale-y-100" : "scale-y-0 group-hover/nav:scale-y-50"
          }`}
        />
        <span className="inline-block transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/nav:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/nav:translate-x-0">
          {label}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group/nav relative whitespace-nowrap pb-2 text-sm transition-colors duration-150 ${
        active ? "font-medium text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 h-[2px] origin-center rounded-full bg-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          active ? "scale-x-100" : "scale-x-0 group-hover/nav:scale-x-50"
        }`}
      />
    </Link>
  );
}
