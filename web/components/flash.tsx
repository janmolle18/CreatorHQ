"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StatusText } from "@/components/ui";
import type { Tone } from "@/lib/status";

const SICHTBAR_MS = 6000;

/**
 * Erfolgs- und Fehlermeldung nach einer Aktion.
 *
 * Die Meldung kommt weiterhin als Query-Parameter (das richtige Muster für
 * Server Actions, die umleiten) — räumt sich aber selbst weg. Vorher blieb
 * sie für immer in der URL stehen und wurde durch den Auto-Refresh dauerhaft
 * wieder eingeblendet.
 */
export function Flash({
  map,
  errorParam = "error",
}: {
  /** Parametername → Meldung. Der Parameterwert wird nur bei %s eingesetzt. */
  map: Record<string, { text: string; tone: Tone }>;
  errorParam?: string;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const key = Object.keys(map).find((name) => params.get(name) !== null);
  const fehler = params.get(errorParam);
  const treffer = fehler
    ? { text: fehler, tone: "err" as Tone }
    : key
      ? { ...map[key]!, text: map[key]!.text.replace("%s", params.get(key) ?? "") }
      : null;

  useEffect(() => {
    if (!treffer) return;
    const timer = setTimeout(() => router.replace(pathname, { scroll: false }), SICHTBAR_MS);
    return () => clearTimeout(timer);
  }, [treffer, pathname, router]);

  if (!treffer) return null;
  return (
    <span role="status">
      <StatusText tone={treffer.tone}>{treffer.text}</StatusText>
    </span>
  );
}
