"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Wenn nichts läuft, reicht ein gemächlicher Takt. */
const RUHE_INTERVALL_MS = 60_000;

/**
 * Lädt die Serverdaten periodisch nach (Listen mit laufenden Jobs).
 *
 * Drei Rücksichten, die vorher fehlten:
 * - Nicht aktualisieren, während jemand in einem Feld tippt — sonst springt
 *   ihm die Karte unter dem Cursor weg.
 * - Nicht aktualisieren, wenn der Tab im Hintergrund liegt.
 * - Nur schnell takten, wenn wirklich etwas läuft (`active`); sonst im
 *   Ruhetakt, damit ein hängender Job die Seite nicht einfriert und der
 *   Rechner nicht dauerhaft Abfragen fährt.
 */
export function AutoRefresh({
  intervalMs = 5000,
  active = true,
}: {
  intervalMs?: number;
  /** false = nichts in Arbeit, langsamer Takt genügt. */
  active?: boolean;
}) {
  const router = useRouter();
  const takt = active ? intervalMs : RUHE_INTERVALL_MS;

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;

      const fokus = document.activeElement;
      const tippt =
        fokus instanceof HTMLElement &&
        (fokus.tagName === "INPUT" ||
          fokus.tagName === "TEXTAREA" ||
          fokus.tagName === "SELECT" ||
          fokus.isContentEditable);
      if (tippt) return;

      router.refresh();
    }, takt);
    return () => clearInterval(timer);
  }, [router, takt]);

  return null;
}
