import { logger } from "../logger.ts";

// Zentraler fetch mit Retry/Backoff für alle Plattform-APIs.
// Behebt ClipPilots fehlendes 429/5xx-Handling: Retry-After wird respektiert,
// sonst exponentieller Backoff mit Jitter.

const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/** Wartezeit bis zum nächsten Versuch. Exportiert, weil hier die Retry-After-Formate hängen. */
export function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_DELAY_MS);
    }
    const asDate = Date.parse(retryAfterHeader);
    if (!Number.isNaN(asDate)) {
      return Math.min(Math.max(0, asDate - Date.now()), MAX_DELAY_MS);
    }
  }
  const exponential = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * 500;
  return Math.min(exponential + jitter, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Query-Parameter, die niemals in einer Logzeile stehen dürfen. Instagram und
// die YouTube-Data-API erwarten ihre Zugangsdaten im Query-String — ohne
// Redaktion landet das entschlüsselte Long-lived-Token bei jedem 429er im
// Klartext in logs/ und hebelt die AES-Verschlüsselung in der Datenbank aus.
const GEHEIME_PARAMETER = [
  "access_token",
  "client_secret",
  "refresh_token",
  "key",
  "sig",
  "code",
];

/** URL fürs Log: Struktur bleibt lesbar, Zugangsdaten werden ersetzt. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of GEHEIME_PARAMETER) {
      if (parsed.searchParams.has(name)) parsed.searchParams.set(name, "[entfernt]");
    }
    return parsed.toString();
  } catch {
    // Kein gültiges URL-Format — dann lieber gar nichts preisgeben.
    return "[unlesbare URL]";
  }
}

/**
 * fetch mit Retries bei 429/5xx/Netzwerkfehlern. 4xx (außer 429) wird sofort
 * zurückgegeben — das ist ein Anwendungsfehler, kein Transportproblem.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retries: number = DEFAULT_RETRIES
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === retries) return response;
      const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
      logger.warn(
        { url: redactUrl(url), status: response.status, attempt, delay },
        "http: Retry"
      );
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
      const delay = retryDelayMs(attempt, null);
      logger.warn(
        { url: redactUrl(url), attempt, delay, err: String(error) },
        "http: Netzwerk-Retry"
      );
      await sleep(delay);
    }
  }
  throw lastError ?? new Error("fetchWithRetry: unerreichbar");
}
