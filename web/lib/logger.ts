import "server-only";

// Schlanker Server-Logger fürs Web.
//
// Der Worker nutzt pino; im Web wäre das eine zusätzliche Abhängigkeit für
// eine Handvoll Meldungen. Wichtig ist nur, dass Fehler als eine Zeile JSON
// auf stderr landen — so kann ein Sammeldienst sie später aufgreifen, ohne
// dass hier etwas geändert werden muss.
//
// Bewusst NICHT console.log: In Server Components landet das im Rauschen des
// Entwicklungsservers und wird im Betrieb übersehen.

type Felder = Record<string, unknown>;

function schreibe(stufe: "info" | "warn" | "error", a: Felder | string, b?: string): void {
  const nachricht = typeof a === "string" ? a : (b ?? "");
  const felder = typeof a === "string" ? {} : a;
  const zeile = JSON.stringify({
    stufe,
    zeit: new Date().toISOString(),
    nachricht,
    ...felder,
  });
  if (stufe === "error") process.stderr.write(zeile + "\n");
  else process.stdout.write(zeile + "\n");
}

export const logger = {
  info: (a: Felder | string, b?: string) => schreibe("info", a, b),
  warn: (a: Felder | string, b?: string) => schreibe("warn", a, b),
  error: (a: Felder | string, b?: string) => schreibe("error", a, b),
};
