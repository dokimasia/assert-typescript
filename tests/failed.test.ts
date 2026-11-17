// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the outcome of the test of a helper's seat. */

import { describe } from "vitest";
import { failed } from "../src/failed.js";
import { check } from "../src/index.js";
import type { Seat } from "../src/matcher/seat.js";
import { Recorder, Standard } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

/** The fault of a call of failed on a seat without the member. */
const NO_MEMBER = "failed: the seat has no member failed";

describe("failed", () => {
  describe("failed", () => {
    it("returns the member failed of the seat", ({ seat }) => {
      const recorder = new Recorder();
      const before = failed(recorder);
      recorder.record("the stated contract");

      check.isEqualTo(
        seat,
        [before, failed(recorder)],
        [false, true],
        "the recorder fails at the record",
      );
    });

    it("returns false for the seat of a test that has not failed", ({ seat }) => {
      check.isFalse(seat, failed(seat), "the test has not failed");
    });

    it("ends the call with a fault on a seat without the member", ({ seat }) => {
      const faults: Error[] = [];
      const bare: Seat = {
        helper: () => undefined,
        fail: () => undefined,
        record: () => undefined,
        reportFault: (fault) => {
          faults.push(fault);
        },
      };

      check.isEqualTo(
        seat,
        [failed(bare), faults.map((fault) => fault.message)],
        [false, [NO_MEMBER]],
        "the seat receives the fault, and failed returns false",
      );
    });

    it("throws the fault on a standard seat", ({ seat }) => {
      const thrown = check.doesThrow(
        seat,
        () => failed(new Standard()),
        "a standard seat has no member failed",
      );

      check.isEqualTo(
        seat,
        (thrown as Error).message,
        NO_MEMBER,
        "the fault states the seat",
      );
    });
  });
});
