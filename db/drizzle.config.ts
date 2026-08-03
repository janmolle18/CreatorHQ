import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// .env liegt im Repo-Root; drizzle-kit läuft mit cwd = db/.
config({ path: "../.env" });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrationen laufen als Eigentümer — die eingeschränkte Anwendungsrolle
    // aus DATABASE_URL darf bewusst kein DDL und unterliegt zudem den
    // Mandantenregeln, die diese Migrationen erst anlegen.
    url:
      process.env.MIGRATION_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgres://creatorhq:creatorhq@localhost:5435/creatorhq",
  },
  verbose: true,
  strict: true,
});
