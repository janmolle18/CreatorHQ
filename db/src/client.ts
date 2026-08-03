import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy-Singleton: Verbindung erst bei erster Nutzung öffnen, damit Build-Schritte
// (z. B. Next.js) ohne gesetzte DATABASE_URL nicht crashen.
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL ist nicht gesetzt");
  const client = postgres(connectionString, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

// Proxy, damit `db.select(...)` weiterhin direkt funktioniert.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop) {
    const real = getDb() as any;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = PostgresJsDatabase<typeof schema>;
