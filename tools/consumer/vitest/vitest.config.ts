// The configuration of the consumer project of tools/consumer/run.sh.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["probe.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
