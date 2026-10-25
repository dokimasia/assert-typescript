// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the drivers of the forms of the assertions about behaviour and of the relations. */

import { describe } from "vitest";
import { BEHAVIOUR_DRIVERS } from "../../../src/conformance/prop/behaviours.js";
import type { Driver, Run } from "../../../src/conformance/prop/drive.js";
import { check } from "../../../src/index.js";
import * as prop from "../../../src/prop/index.js";
import { Recorder } from "../../../src/seat.js";
import { test as it } from "../../../src/vitest.js";

/** Returns a run of the subject kinds subjects over the integers -5 to 5. */
function runOf(...subjects: unknown[]): Run {
  return {
    subjects,
    args: [],
    options: [
      prop.using(prop.integer(-5, 5)),
      prop.hermetic(),
      prop.seed(1n),
      prop.store(""),
    ],
    bind: (value) => value,
    integer: (text) => BigInt(text),
  };
}

/** Returns the assertions of the failures of a run of the driver of id. */
async function failuresOf(id: string, run: Run): Promise<string[]> {
  const recorder = new Recorder();
  await (new Map(BEHAVIOUR_DRIVERS).get(id) as Driver)(recorder, run);
  return recorder.failures.map((failure) => failure.assertion);
}

describe("behaviours", () => {
  describe("BEHAVIOUR_DRIVERS", () => {
    it("lists the forms of the assertions about behaviour and of the relations", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        BEHAVIOUR_DRIVERS.map(([id]) => id),
        [
          "prop-err-absent",
          "prop-err-present",
          "prop-err-is",
          "prop-err-is-not",
          "prop-err-as",
          "prop-throws",
          "prop-not-throws",
          "prop-pure",
          "prop-not-pure",
          "prop-nil-context-safe",
          "prop-honours-cancellation",
          "prop-honours-deadline",
          "prop-idempotent",
          "prop-accumulates",
          "prop-deterministic",
          "prop-commutative",
          "prop-associative",
          "prop-round-trip",
        ],
        "the 18 forms",
      );
    });

    it("runs an error form with the subject's own failure as its sentinel", async ({
      seat,
    }) => {
      check.isEmpty(
        seat,
        await failuresOf("prop-err-is", runOf("fails-otherwise")),
        "no failure",
      );
    });

    it("runs a form that fails for a negative input", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await failuresOf("prop-throws", runOf("raises-on-negative")),
        ["prop-throws"],
        "the failure of the form",
      );
    });

    it("runs a relation on the subject that its kind builds", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await failuresOf("prop-commutative", runOf("subtracts")),
        ["prop-commutative"],
        "subtraction is not commutative",
      );
    });
  });
});
