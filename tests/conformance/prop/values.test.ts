// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the drivers of the forms of the assertions about a value. */

import { describe } from "vitest";
import type { Driver, Run } from "../../../src/conformance/prop/drive.js";
import { VALUE_DRIVERS } from "../../../src/conformance/prop/values.js";
import { check } from "../../../src/index.js";
import * as prop from "../../../src/prop/index.js";
import { Recorder } from "../../../src/seat.js";
import { test as it } from "../../../src/vitest.js";

/** Returns a run of the subject kinds subjects over the integers -5 to 5. */
function runOf(subjects: unknown[], args: unknown[] = []): Run {
  return {
    subjects,
    args,
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
  await (new Map(VALUE_DRIVERS).get(id) as Driver)(recorder, run);
  return recorder.failures.map((failure) => failure.assertion);
}

describe("values", () => {
  describe("VALUE_DRIVERS", () => {
    it("lists the forms of the assertions about a value", ({ seat }) => {
      check.isEqualTo(
        seat,
        VALUE_DRIVERS.map(([id]) => id),
        [
          "prop-equal",
          "prop-not-equal",
          "prop-true",
          "prop-false",
          "prop-nil",
          "prop-not-nil",
          "prop-length",
          "prop-empty",
          "prop-not-empty",
          "prop-contains",
          "prop-not-contains",
          "prop-contains-in-order",
          "prop-permutation",
          "prop-has-prefix",
          "prop-has-suffix",
          "prop-matches",
          "prop-close-to",
          "prop-in-range",
          "prop-pairwise",
        ],
        "the 19 forms",
      );
    });

    it("runs a form that passes for every input", async ({ seat }) => {
      check.isEmpty(
        seat,
        await failuresOf("prop-equal", runOf(["identity", "identity"])),
        "no failure",
      );
    });

    it("runs a form that fails for a negative input", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await failuresOf("prop-true", runOf(["is-non-negative"])),
        ["prop-true"],
        "the failure of the form",
      );
    });

    it("runs a form with the values beside its subjects", async ({ seat }) => {
      check.isEmpty(
        seat,
        await failuresOf("prop-in-range", runOf(["identity"], [-5, 5])),
        "no failure",
      );
    });
  });
});
