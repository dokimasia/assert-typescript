import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The adapter is a thin binding to Vitest's own fixture API, and
      // the barrels only re-export. Testing them would test Vitest.
      exclude: ["src/index.ts", "src/option.ts", "src/conformance/index.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
