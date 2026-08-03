import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/src/**/*.test.ts", "db/src/**/*.test.ts", "worker/src/**/*.test.ts", "web/**/*.test.ts"],
    environment: "node",
  },
});
