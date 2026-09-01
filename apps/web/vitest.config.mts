import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // PGlite (real WASM Postgres, used by src/test/pglite-db.ts for genuine
    // DB-backed integration tests) needs several seconds to initialize and
    // replay migrations — comfortably over Vitest's 5s default, especially
    // on a cold run. This is real I/O/compute time, not a hang.
    testTimeout: 20000,
  },
});
