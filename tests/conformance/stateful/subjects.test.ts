// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the machine subjects of the definition. Each run's outcome is
 * the one that the machines vectors of the definition state for the subject
 * under seed 1.
 */

import { describe } from "vitest";
import {
  type Setup,
  SUBJECTS,
  type Subject,
} from "../../../src/conformance/stateful/subjects.js";
import { check } from "../../../src/index.js";
import { compareText } from "../../../src/order.js";
import { swarm } from "../../../src/stateful/option.js";
import { pct } from "../../../src/stateful/strategy.js";
import { test as it } from "../../../src/vitest.js";
import { MACHINE_SETUP as DEFAULT, machineOutcome } from "../../helpers.js";

/** Returns the outcome of a run of the subject of name under setup and seed 1, and the assertion of its failure. */
function outcomeOf(name: string, setup: Setup): Promise<[unknown, unknown]> {
  return machineOutcome((SUBJECTS.get(name) as () => Subject)(), setup);
}

describe("subjects", () => {
  describe("SUBJECTS", () => {
    it("states the twelve machine subjects of the definition", ({ seat }) => {
      check.isEqualTo(
        seat,
        [...SUBJECTS.keys()].sort(compareText),
        [
          "correct-counter",
          "correct-queue",
          "counter-overflows",
          "counter-refuses-every-third",
          "queue-loses-on-wrap",
          "racy-counter",
          "register-flushes",
          "register-flushes-in-two-parts",
          "spins-until-a-flag",
          "store-loses-on-crash",
          "ticker",
          "ticker-skips-its-first-tick",
        ],
        "the names",
      );
    });

    const tests: { name: string; give: [string, Setup]; want: [string, unknown] }[] = [
      {
        name: "queue-loses-on-wrap",
        give: ["queue-loses-on-wrap", DEFAULT],
        want: ["counterexample", "linearizable"],
      },
      {
        name: "correct-queue",
        give: ["correct-queue", DEFAULT],
        want: ["passed", null],
      },
      {
        name: "counter-overflows",
        give: ["counter-overflows", DEFAULT],
        want: ["counterexample", "linearizable"],
      },
      {
        name: "store-loses-on-crash",
        give: ["store-loses-on-crash", DEFAULT],
        want: ["counterexample", "lost-write"],
      },
      {
        name: "racy-counter",
        give: ["racy-counter", DEFAULT],
        want: ["counterexample", "linearizable"],
      },
      {
        name: "correct-counter",
        give: ["correct-counter", DEFAULT],
        want: ["passed", null],
      },
      {
        name: "counter-refuses-every-third",
        give: ["counter-refuses-every-third", { ...DEFAULT, steps: [swarm(false)] }],
        want: ["flaky", null],
      },
      {
        name: "register-flushes-in-two-parts",
        give: ["register-flushes-in-two-parts", DEFAULT],
        want: ["counterexample", "linearizable"],
      },
      {
        name: "register-flushes",
        give: ["register-flushes", DEFAULT],
        want: ["passed", null],
      },
      {
        name: "ticker-skips-its-first-tick",
        give: ["ticker-skips-its-first-tick", { ...DEFAULT, strategy: pct(1) }],
        want: ["counterexample", "linearizable"],
      },
      {
        name: "ticker",
        give: ["ticker", { ...DEFAULT, strategy: pct(1) }],
        want: ["passed", null],
      },
      {
        name: "spins-until-a-flag",
        give: ["spins-until-a-flag", { ...DEFAULT, maxReleases: 50 }],
        want: ["counterexample", null],
      },
    ];
    for (const tt of tests) {
      it(`maps ${tt.name} to a subject whose run ends as its vectors state`, async ({
        seat,
      }) => {
        check.isEqualTo(seat, await outcomeOf(...tt.give), tt.want, "the outcome");
      });
    }
  });
});
