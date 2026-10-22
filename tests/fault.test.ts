// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the end of a helper's call with a fault. */

import { describe } from "vitest";
import { fault } from "../src/fault.js";
import { byIdentity, check } from "../src/index.js";
import { Recorder, Standard } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

/** Returns what call throws, and undefined for a call that returns. */
function thrownBy(call: () => void): unknown {
  try {
    call();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe("fault", () => {
  describe("fault", () => {
    it("passes the error to a seat with reportFault, which fails with its message", ({
      seat,
    }) => {
      const broken = new RangeError("loaded: the path is empty");
      const recorder = new Recorder();
      fault(recorder, broken);

      check.hasLength(seat, recorder.faults, 1, "one fault");
      check.isEqualTo(
        seat,
        recorder.faults[0],
        broken,
        "the fault as the error it is",
        byIdentity(),
      );
      check.isEqualTo(
        seat,
        recorder.message,
        "loaded: the path is empty",
        "the recorder fails",
      );
    });

    it("returns for a seat with reportFault", ({ seat }) => {
      let after = false;
      const recorder = new Recorder();
      fault(recorder, new Error("loaded: the path is empty"));
      after = true;

      check.isTrue(seat, after, "the helper returns after fault");
    });

    it("throws the error for a seat without reportFault", ({ seat }) => {
      const broken = new RangeError("loaded: the path is empty");

      check.isEqualTo(
        seat,
        thrownBy(() => fault(new Standard(), broken)),
        broken,
        "the fault itself",
        byIdentity(),
      );
    });

    it("writes no call record", ({ seat }) => {
      const recorder = new Recorder();
      fault(recorder, new Error("loaded: the path is empty"));

      check.isEqualTo(
        seat,
        recorder.records,
        [],
        "the call is not a call of an assertion",
      );
    });
  });
});
