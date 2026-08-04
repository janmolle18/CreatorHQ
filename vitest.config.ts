import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "shared/src/**/*.test.ts",
      "db/src/**/*.test.ts",
      "worker/src/**/*.test.ts",
      "web/**/*.test.ts",
    ],
    environment: "node",
    alias: {
      // `server-only` wirft absichtlich, sobald es außerhalb einer Server
      // Component geladen wird — das ist sein einziger Zweck. Im Test ist das
      // kein Schutz, sondern ein Hindernis: Wir prüfen genau die Module, die
      // sich damit schützen.
      //
      // fileURLToPath statt .pathname: Der Projektpfad enthält ein Leerzeichen,
      // und .pathname liefert es prozentkodiert zurück — die Zuordnung griffe
      // dann stillschweigend nicht.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
});
