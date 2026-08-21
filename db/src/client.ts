import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy-Singleton: Verbindung erst bei erster Nutzung öffnen, damit Build-Schritte
// (z. B. Next.js) ohne gesetzte DATABASE_URL nicht crashen.
let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: postgres.Sql | null = null;

/**
 * Größe des Verbindungspools.
 *
 * Der Worker braucht mehr als das Web: Lang laufende Aufträge (Download,
 * Rendern, Upload) belegen für ihre Dauer je eine Verbindung, und der
 * Minuten-Takt braucht daneben noch eine freie — sonst wartet der Takt auf
 * eine Verbindung, die ein Auftrag hält, der auf den Takt wartet.
 */
function poolGroesse(): number {
  const gesetzt = Number(process.env.DB_POOL_MAX);
  return Number.isInteger(gesetzt) && gesetzt > 0 ? gesetzt : 10;
}

function verbinde(): postgres.Sql {
  if (_client) return _client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL ist nicht gesetzt");
  _client = postgres(connectionString, { max: poolGroesse() });
  return _client;
}

function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  _db = drizzle(verbinde(), { schema });
  return _db;
}

// Proxy, damit `db.select(...)` weiterhin direkt funktioniert.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop) {
    const real = getDb();
    const value: unknown = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * Eine für den Aufrufer reservierte Verbindung samt eigenem Drizzle-Handle.
 *
 * Gebraucht für lang laufende Arbeit, bei der eine Transaktion falsch wäre —
 * siehe withTenantSession in tenant.ts.
 */
export async function reservierteVerbindung(): Promise<{
  db: PostgresJsDatabase<typeof schema>;
  roh: postgres.ReservedSql;
  freigeben: () => void;
}> {
  const pool = verbinde();
  const roh = await pool.reserve();

  // Drizzle liest beim Ausführen `client.options.parsers` — eine reservierte
  // Verbindung von postgres.js trägt `options` aber nicht, sie erbt nur die
  // Abfrage-Schnittstelle. Ohne diesen Durchreicher scheitert jede Abfrage mit
  // „Cannot read properties of undefined (reading 'parsers')".
  const fuerDrizzle = new Proxy(roh, {
    get(ziel, name, empfaenger) {
      if (name === "options") return (pool as unknown as { options: unknown }).options;
      return Reflect.get(ziel, name, empfaenger);
    },
  });

  return {
    db: drizzle(fuerDrizzle as postgres.Sql, { schema }),
    roh,
    freigeben: () => roh.release(),
  };
}

export type DB = PostgresJsDatabase<typeof schema>;
