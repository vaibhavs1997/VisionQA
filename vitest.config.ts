import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: false,
    server: {
      deps: {
        // Vite 5's built-in Node module list predates node:sqlite (added
        // in Node 22.5) — without this, Vite tries to bundle/transform it
        // as if it were a regular package and fails to resolve it.
        external: [/node:sqlite/, /^sqlite$/],
      },
    },
  },
});
