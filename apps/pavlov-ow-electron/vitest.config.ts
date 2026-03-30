import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/renderer/**/*.ts",
        "src/main/index.ts",
        "src/main/preload.ts",
        "src/main/overlayPreload.ts",
        "src/main/services/beamBridge.ts",
        "src/main/services/legacyMigration.ts",
        "src/main/services/pavlovIcon.ts"
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 60,
        statements: 75
      }
    }
  }
});
