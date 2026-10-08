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
import { forAll } from "../../../src/prop/forall.js";
import { hermetic, seed, store } from "../../../src/prop/option.js";
import { Recorder } from "../../../src/seat.js";
import { clients, swarm } from "../../../src/stateful/option.js";
import { uniform } from "../../../src/stateful/strategy.js";
import { test as it } from "../../../src/vitest.js";
import { records } from "../../helpers.js";

/** The setup of a vector that states none. */
const DEFAULT: Setup = { steps: [], section: [clients(2)], strategy: uniform() };

/** Returns the outcome of a run of the subject of name under setup and seed 1, and the assertion of its failure. */
async function outcomeOf(name: string, setup: Setup): Promise<[unknown, unknown]> {
  const subject = (SUBJECTS.get(name) as () => Subject)();
  const recorder = new Recorder();
  await forAll(
    recorder,
    "the subject",
    (c) => subject(c, setup),
    seed(1n),
    hermetic(),
    store(""),
  );
  const detail = records(recorder)[0]?.["detail"] as Record<string, unknown>;
  const failure = detail["failure"] as Record<string, unknown> | null;
  return [detail["outcome"], failure?.["assertion"] ?? null];
}

describe("subjects", () => {
  describe("SUBJECTS", () => {
    it("states the seven machine subjects of the definition", ({ seat }) => {
      check.equal(
        seat,
        [...SUBJECTS.keys()].sort(),
        [
          "correct-counter",
          "correct-queue",
          "counter-overflows",
          "counter-refuses-every-third",
          "queue-loses-on-wrap",
          "racy-counter",
          "store-loses-on-crash",
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
    ];
    for (const tt of tests) {
      it(`maps ${tt.name} to a subject whose run ends as its vectors state`, async ({
        seat,
      }) => {
        check.equal(seat, await outcomeOf(...tt.give), tt.want, "the outcome");
      });
    }
  });
});
