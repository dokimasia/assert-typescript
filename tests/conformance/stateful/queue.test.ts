// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the machine of the queue subjects. Each run's outcome is the
 * one that the machines vectors of the definition state for the subject
 * under seed 1.
 */

import { describe } from "vitest";
import { queue } from "../../../src/conformance/stateful/queue.js";
import { check } from "../../../src/index.js";
import { test as it } from "../../../src/vitest.js";
import { MACHINE_SETUP, machineOutcome } from "../../helpers.js";

describe("queue", () => {
  describe("queue", () => {
    it("fails linearizable over a ring that loses on wrap", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await machineOutcome((c, setup) => queue(c, setup, true), MACHINE_SETUP),
        ["counterexample", "linearizable"],
        "the outcome",
      );
    });

    it("passes over a ring that writes every value at its write index", async ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        await machineOutcome((c, setup) => queue(c, setup, false), MACHINE_SETUP),
        ["passed", null],
        "the outcome",
      );
    });
  });
});
