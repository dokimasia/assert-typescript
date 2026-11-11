// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the machine subjects with tasks of their own. Each run's
 * outcome is the one that the machines vectors of the definition state for
 * the subject under seed 1.
 */

import { describe } from "vitest";
import {
  flushedRegister,
  spinner,
  ticker,
} from "../../../src/conformance/stateful/background.js";
import { check } from "../../../src/index.js";
import { pct } from "../../../src/stateful/strategy.js";
import { test as it } from "../../../src/vitest.js";
import { MACHINE_SETUP, machineOutcome } from "../../helpers.js";

describe("background", () => {
  describe("flushedRegister", () => {
    it("fails linearizable over a flusher that yields between its two parts", async ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        await machineOutcome(
          (c, setup) => flushedRegister(c, setup, true),
          MACHINE_SETUP,
        ),
        ["counterexample", "linearizable"],
        "the outcome",
      );
    });

    it("passes over a flusher without a yield", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await machineOutcome(
          (c, setup) => flushedRegister(c, setup, false),
          MACHINE_SETUP,
        ),
        ["passed", null],
        "the outcome",
      );
    });
  });

  describe("ticker", () => {
    it("fails linearizable over a ticker that skips its first tick", async ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        await machineOutcome((c, setup) => ticker(c, setup, true), {
          ...MACHINE_SETUP,
          strategy: pct(1),
        }),
        ["counterexample", "linearizable"],
        "the outcome",
      );
    });

    it("passes over a ticker that adds one at each tick", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await machineOutcome((c, setup) => ticker(c, setup, false), {
          ...MACHINE_SETUP,
          strategy: pct(1),
        }),
        ["passed", null],
        "the outcome",
      );
    });
  });

  describe("spinner", () => {
    it("fails the case at the most releases of its scheduler", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await machineOutcome(spinner, { ...MACHINE_SETUP, maxReleases: 50 }),
        ["counterexample", null],
        "the failure has no assertion",
      );
    });
  });
});
