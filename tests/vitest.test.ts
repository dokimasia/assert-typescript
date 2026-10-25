// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the vitest entry point: the names that it exports. It uses
 * vitest's `expect` alone, because the other specs assert on the seat that
 * the entry point supplies.
 */

import { describe, expect, it } from "vitest";
import { compareText } from "../src/order.js";
import * as seats from "../src/seat.js";
import * as api from "../src/vitest/api.js";
import * as entry from "../src/vitest.js";

describe("vitest", () => {
  it("exports the adapter and the seats", () => {
    expect(Object.keys(entry).sort(compareText)).toEqual([
      "Collector",
      "RECORDS",
      "Recorder",
      "Standard",
      "register",
      "test",
    ]);
  });

  it("re-exports the adapter of the module api", () => {
    expect([entry.register, entry.test, entry.RECORDS]).toEqual([
      api.register,
      api.test,
      api.RECORDS,
    ]);
  });

  it("re-exports the seats of the module seat", () => {
    expect([entry.Collector, entry.Recorder, entry.Standard]).toEqual([
      seats.Collector,
      seats.Recorder,
      seats.Standard,
    ]);
  });
});
