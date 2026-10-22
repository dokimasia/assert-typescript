// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

// The configuration of the consumer project of tools/consumer/run.sh.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["probe.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
