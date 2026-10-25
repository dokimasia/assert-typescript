// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the phases of a run after its known cases, and of the checks of its requirements. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Replaying } from "../../../src/prop/engine/case/providers.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import type { Execution, Phase } from "../../../src/prop/engine/execution.js";
import { Integer } from "../../../src/prop/engine/generator.js";
import { checks, Phases } from "../../../src/prop/engine/phases.js";
import { resolve, type Settings } from "../../../src/prop/engine/settings.js";
import { Tally } from "../../../src/prop/engine/tally.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";
import { body, integers } from "../../helpers.js";

const SEED = 7n;
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));

/** A body that draws one wide integer and passes. */
const passes = body((c) => {
  c.draw(WIDE, "n");
});

/** Returns the phases of a run of a body under settings, and the phases that its observer saw. */
function phasesOf(
  of: ReturnType<typeof body>,
  settings: Settings = { seed: SEED },
): [Phases, Phase[]] {
  const seen: Phase[] = [];
  const observer = (phase: Phase, _execution: Execution): void => {
    seen.push(phase);
  };
  return [new Phases(of, resolve(settings), new Tally(SEED), observer), seen];
}

describe("phases", () => {
  describe("Phases.call", () => {
    it("runs one case into the tree and shows it to the observer", async ({ seat }) => {
      const [phases, seen] = phasesOf(passes);
      const execution = await drive(phases.call(new Replaying(integers(5n)), "random"));

      check.isEqualTo(
        seat,
        [execution.status, seen, phases.tree.nodes > 1],
        ["passed", ["random"], true],
        "one case in the tree",
      );
    });
  });

  describe("Phases.attempt", () => {
    it("counts a passing case and returns no outcome", async ({ seat }) => {
      const [phases] = phasesOf(passes);
      const outcome = await drive(phases.attempt(new Replaying([]), "simplest"));

      check.isEqualTo(
        seat,
        [outcome, phases.tally.valid],
        [undefined, 1],
        "one valid case",
      );
    });

    it("returns the counterexample of a failing case", async ({ seat }) => {
      const [phases] = phasesOf(
        body((c) => {
          c.draw(WIDE, "n");
          c.fail("always");
        }),
      );
      const outcome = await drive(phases.attempt(new Replaying([]), "simplest"));

      check.isEqualTo(seat, outcome?.kind, "counterexample", "the failure");
    });
  });

  describe("Phases.runTo", () => {
    it("runs random cases until the target of valid cases, then the edge cases", async ({
      seat,
    }) => {
      const [phases, seen] = phasesOf(passes);
      const outcome = await drive(phases.runTo(10));

      check.isEqualTo(
        seat,
        [
          outcome,
          phases.tally.valid >= 10,
          seen.filter((one) => one === "edge").length,
        ],
        [undefined, true, 4],
        "ten valid cases and the four edge cases",
      );
    });
  });

  describe("checks", () => {
    it("returns no outcome for a run that meets every requirement", async ({
      seat,
    }) => {
      const [phases] = phasesOf(passes, { seed: SEED, cases: 10 });

      check.isNil(seat, await drive(checks(phases)), "a pass");
    });

    it("returns coverage-unmet for a requirement that the cases leave unmet", async ({
      seat,
    }) => {
      const [phases] = phasesOf(passes, {
        seed: SEED,
        cases: 10,
        requirements: [{ label: "never", share: 0.5 }],
      });

      check.isEqualTo(
        seat,
        (await drive(checks(phases)))?.kind,
        "coverage-unmet",
        "the requirement",
      );
    });
  });
});
