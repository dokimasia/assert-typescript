// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the skip of the test of a helper's seat. */

import { describe } from "vitest";
import { check } from "../src/index.js";
import type { Seat } from "../src/matcher/seat.js";
import { Recorder, Standard } from "../src/seat.js";
import { skip } from "../src/skip.js";
import { test as it } from "../src/vitest.js";

/** The fault of a call of skip on a seat without the member. */
const NO_MEMBER = "skip: the seat has no member skip";

describe("skip", () => {
  describe("skip", () => {
    it("skips the test through the member of the seat", ({ seat }) => {
      const reasons: string[] = [];
      const skipped = new Error("skipped");
      const skipping: Seat = {
        helper: () => undefined,
        fail: () => undefined,
        record: () => undefined,
        skip: (reason) => {
          reasons.push(reason);
          throw skipped;
        },
      };
      const thrown = check.doesThrow(
        seat,
        () => skip(skipping, "the test needs docker"),
        "the member ends the call",
      );

      check.isEqualTo(
        seat,
        [thrown, reasons],
        [skipped, ["the test needs docker"]],
        "the seat receives the reason",
      );
    });

    it("ends the call with a fault on a seat without the member", ({ seat }) => {
      const recorder = new Recorder();
      skip(recorder, "the test needs docker");

      check.isEqualTo(
        seat,
        recorder.faults.map((fault) => fault.message),
        [NO_MEMBER],
        "the recorder keeps the fault, and the test does not skip",
      );
    });

    it("throws the fault on a standard seat", ({ seat }) => {
      const thrown = check.doesThrow(
        seat,
        () => skip(new Standard(), "the test needs docker"),
        "a standard seat has no member skip",
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
