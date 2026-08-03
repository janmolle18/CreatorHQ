"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
        // Der aktive Punkt trägt die Akzentmarke — das ist der eine Ort, an dem
        // im Menü Farbe auftaucht, und dadurch sofort auffindbar.
        className={`-ml-px rounded-r-md border-l-2 py-1.5 pl-4 text-sm transition-colors ${
          active
            ? "border-accent bg-accent/[0.07] font-medium text-ink"
            : "border-transparent text-ink-soft hover:bg-raised/60 hover:text-ink"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`whitespace-nowrap pb-2 text-sm transition-colors ${
        active
          ? "border-b-2 border-accent font-medium text-ink"
          : "border-b-2 border-transparent text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
