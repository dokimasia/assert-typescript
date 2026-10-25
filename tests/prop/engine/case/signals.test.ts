// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the signals that end a case.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  Failed,
  Overrun,
  Rejected,
  Skipped,
} from "../../../../src/prop/engine/case/signals.js";
import { test as it } from "../../../../src/vitest.js";

describe("signals", () => {
  describe("new Rejected", () => {
    it("returns the signal of a rejected case", ({ seat }) => {
      const signal = new Rejected();

      check.isEqualTo(
        seat,
        [signal.name, signal.message],
        ["Rejected", "prop: the case is rejected"],
        "the name and the message",
      );
    });
  });

  describe("new Overrun", () => {
    it("returns a rejection", ({ seat }) => {
      check.errorIs(seat, new Overrun(), Rejected, "an overrun is a rejection");
    });
  });

  describe("new Failed", () => {
    it("returns the failure of an identity with its record", ({ seat }) => {
      const failed = new Failed("true@a.ts:1", { assertion: "true" });

      check.isEqualTo(
        seat,
        [failed.name, failed.message, failed.identity, failed.record],
        [
          "Failed",
          "prop: the case fails as true@a.ts:1",
          "true@a.ts:1",
          { assertion: "true" },
        ],
        "the fields",
      );
    });
  });

  describe("new Skipped", () => {
    it("returns the skip of a reason", ({ seat }) => {
      const skipped = new Skipped("the case needs a capability");

      check.isEqualTo(
        seat,
        [skipped.name, skipped.message, skipped.reason],
        [
          "Skipped",
          "prop: the case skips the run: the case needs a capability",
          "the case needs a capability",
        ],
        "the fields",
      );
    });
  });
});
