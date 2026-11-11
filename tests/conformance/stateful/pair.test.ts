// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the machine of the subject pair-fails-at-7-and-3. Each run
 * takes its first case from a trace under seed 1.
 */

import { describe } from "vitest";
import { pairFails } from "../../../src/conformance/stateful/pair.js";
import { check } from "../../../src/index.js";
import { cases, draws } from "../../../src/prop/option.js";
import { swarm } from "../../../src/stateful/option.js";
import { test as it } from "../../../src/vitest.js";
import { MACHINE_SETUP, machineOutcome } from "../../helpers.js";

/** The setup of the specs, whose steps take any action without a swarm. */
const SETUP = { ...MACHINE_SETUP, steps: [swarm(false)] };

describe("pair", () => {
  describe("pairFails", () => {
    it("fails pair for a put of the pair 7 and 3", async ({ seat }) => {
      const trace = [
        { step: "put" },
        { label: "a", value: { type: "int", value: 7 } },
        { label: "b", value: { type: "int", value: 3 } },
        { label: "pair", value: { type: "list", of: "int", value: [7, 3] } },
      ];

      check.isEqualTo(
        seat,
        await machineOutcome(pairFails, SETUP, draws(JSON.stringify(trace))),
        ["counterexample", "pair"],
        "the outcome",
      );
    });

    it("passes a noop and a put of another pair", async ({ seat }) => {
      const trace = [
        { step: "noop" },
        { step: "put" },
        { label: "a", value: { type: "int", value: 7 } },
        { label: "b", value: { type: "int", value: 4 } },
        { label: "pair", value: { type: "list", of: "int", value: [7, 4] } },
      ];

      check.isEqualTo(
        seat,
        await machineOutcome(pairFails, SETUP, draws(JSON.stringify(trace)), cases(1)),
        ["passed", null],
        "the outcome",
      );
    });
  });
});
