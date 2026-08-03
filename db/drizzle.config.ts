import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// .env liegt im Repo-Root; drizzle-kit läuft mit cwd = db/.
config({ path: "../.env" });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://creatorhq:creatorhq@localhost:5434/creatorhq",
  },
  verbose: true,
  strict: true,
});
