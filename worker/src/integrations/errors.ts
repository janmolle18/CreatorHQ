// Gemeinsame Fehlertypen der Plattform-Integrationen.

/** Token ungültig/abgelaufen → Account braucht „Neu verbinden". */
export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}
