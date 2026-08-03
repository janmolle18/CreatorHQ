// Einfaches In-Memory-Sliding-Window-Rate-Limit für den Login.
// Bewusst prozesslokal: ein Admin, ein Server — kein Redis nötig.

export interface RateLimiter {
  /** true = Versuch erlaubt (und gezählt), false = Limit erreicht. */
  check(key: string, now?: number): boolean;
  reset(key: string): void;
  /** Anzahl verfolgter Schlüssel — nur zum Prüfen des Aufräumens. */
  size(): number;
}

export function createRateLimiter(options: {
  max: number;
  windowMs: number;
}): RateLimiter {
  const { max, windowMs } = options;
  const attempts = new Map<string, number[]>();

  // Ab hier wird aufgeräumt. Ohne das wächst die Map unbegrenzt: Wer bei jedem
  // Versuch einen anderen Schlüssel schickt, legt sonst pro Anfrage einen
  // neuen Eintrag an, der nie wieder verschwindet.
  const AUFRAEUMEN_AB = 1000;

  function aufraeumen(now: number): void {
    const windowStart = now - windowMs;
    for (const [key, zeiten] of attempts) {
      if (zeiten.every((t) => t <= windowStart)) attempts.delete(key);
    }
  }

  return {
    check(key: string, now: number = Date.now()): boolean {
      if (attempts.size > AUFRAEUMEN_AB) aufraeumen(now);
      const windowStart = now - windowMs;
      const recent = (attempts.get(key) ?? []).filter((t) => t > windowStart);
      if (recent.length >= max) {
        attempts.set(key, recent);
        return false;
      }
      attempts.set(key, [...recent, now]);
      return true;
    },
    size(): number {
      return attempts.size;
    },
    reset(key: string): void {
      attempts.delete(key);
    },
  };
}
