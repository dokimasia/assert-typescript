import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The specs of golden trees change the working directory of their
    // process, which a worker thread cannot.
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
