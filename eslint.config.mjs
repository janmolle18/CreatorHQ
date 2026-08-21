// ESLint-Flat-Config für das gesamte Monorepo.
// Bewusst OHNE type-checked-Regeln, damit der Lauf schnell bleibt —
// Typfehler fängt weiterhin `npm run typecheck` (tsc) ab.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Build-Artefakte, generierte Migrationen und lose Hilfsskripte bleiben ungelintet.
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "db/drizzle/**",
      "ops/**",
      "scripts/**",
      "data/**",
      "tmp/**",
    ],
  },
  {
    files: [
      "db/src/**/*.ts",
      "shared/src/**/*.ts",
      "worker/src/**/*.ts",
      "web/app/**/*.{ts,tsx}",
      "web/lib/**/*.{ts,tsx}",
      "web/components/**/*.{ts,tsx}",
      "web/middleware.ts",
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Absichtlich ungenutzte Parameter tragen im Repo einen Unterstrich
      // (z. B. `_db`, `_t`) — die Konvention bleibt erlaubt, alles andere fliegt.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  }
);
