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
        className={`border-l-2 py-1 pl-4 text-sm transition-colors ${
          active
            ? "border-ink font-medium text-ink"
            : "border-transparent text-ink-soft hover:border-hairline hover:text-ink"
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
          ? "border-b-2 border-ink font-medium text-ink"
          : "border-b-2 border-transparent text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
