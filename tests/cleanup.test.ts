// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the registration of a cleanup on the seat of a helper. */

import { describe } from "vitest";
import { cleanup } from "../src/cleanup.js";
import { check } from "../src/index.js";
import type { Seat } from "../src/matcher/seat.js";
import { Recorder, Standard } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

/** The fault of a call of cleanup on a seat without the member. */
const NO_MEMBER = "cleanup: the seat has no member cleanup";

describe("cleanup", () => {
  describe("cleanup", () => {
    it("registers the function with the member of the seat", async ({ seat }) => {
      const recorder = new Recorder();
      const order: string[] = [];
      cleanup(recorder, () => {
        order.push("released");
      });
      check.isEqualTo(seat, order, [], "the function waits for the end of the test");

      await recorder.runCleanups();
      check.isEqualTo(seat, order, ["released"], "the recorder runs the function");
    });

    it("ends the call with a fault on a seat without the member", ({ seat }) => {
      const faults: [string, boolean][] = [];
      const plain: Seat = {
        helper: () => undefined,
        fail: () => undefined,
        record: () => undefined,
        reportFault: (fault, ending) => {
          faults.push([fault.message, ending]);
        },
      };
      const order: string[] = [];
      cleanup(plain, () => {
        order.push("released");
      });

      check.isEqualTo(
        seat,
        [faults, order],
        [[[NO_MEMBER, true]], []],
        "the seat receives the fault, and the function does not run",
      );
    });

    it("throws the fault on a standard seat", ({ seat }) => {
      const thrown = check.doesThrow(
        seat,
        () => cleanup(new Standard(), () => undefined),
        "a standard seat has no end of a test",
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
