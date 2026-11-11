// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the settings of a run and of the cases that it tries before it generates any. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { MAX_CHOICES } from "../../../src/prop/engine/case.js";
import {
  DEFAULT_CASES,
  knownCases,
  resolve,
  Values,
} from "../../../src/prop/engine/settings.js";
import { Tracing } from "../../../src/prop/engine/trace.js";
import { test as it } from "../../../src/vitest.js";
import { integers, storedCase, thrown } from "../../helpers.js";

const SEED = 7n;

describe("settings", () => {
  describe("DEFAULT_CASES", () => {
    it("aims for 100 valid cases", ({ seat }) => {
      check.isEqualTo(seat, DEFAULT_CASES, 100, "the cases");
    });
  });

  describe("new Values", () => {
    it("keeps the values of the draws", ({ seat }) => {
      check.isEqualTo(seat, new Values([1n, "x"]).values, [1n, "x"], "two values");
    });
  });

  describe("resolve", () => {
    it("fills in every default", ({ seat }) => {
      check.isEqualTo(
        seat,
        resolve({ seed: SEED }),
        {
          seed: SEED,
          cases: 100,
          maxChoices: MAX_CHOICES,
          requirements: [],
          traces: [],
          examples: [],
          stored: [],
          shrink: 2000,
          shrinkTime: 0,
          explain: true,
          replay: undefined,
          confirm: 0,
          replays: 1,
        },
        "the defaults",
      );
    });

    it("throws a RangeError for a run of no case", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => resolve({ seed: SEED, cases: 0 })),
        "prop: a run of 0 cases tests nothing",
        "the refusal",
      );
    });

    it("throws a RangeError for a run of no replay", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => resolve({ seed: SEED, replays: 0 })),
        "prop: a run of 0 replays does not replay a failing case",
        "the refusal",
      );
    });
  });

  describe("knownCases", () => {
    it("returns the stored cases after every case of the example phase", ({ seat }) => {
      const known = knownCases(
        resolve({
          seed: SEED,
          traces: [[{ label: "n", value: 5n }]],
          examples: [integers(3n), new Values([4n])],
          stored: [storedCase(6n)],
        }),
      );

      check.isEqualTo(
        seat,
        known.map(([phase, provider]) => [phase, provider.constructor.name]),
        [
          ["example", Tracing.name],
          ["example", "Replaying"],
          ["example", "Valuing"],
          ["stored", "Stored"],
        ],
        "four cases, the last of them the stored case",
      );
    });
  });
});
