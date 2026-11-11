// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the entries of a property's store. */

import { describe } from "vitest";
import { Failure } from "../../src/failure.js";
import { check } from "../../src/index.js";
import { Replaying } from "../../src/prop/engine/case/providers.js";
import { Failed } from "../../src/prop/engine/case/signals.js";
import { Case } from "../../src/prop/engine/case.js";
import type { Choice } from "../../src/prop/engine/choice.js";
import type { Execution } from "../../src/prop/engine/execution.js";
import type { Generator } from "../../src/prop/engine/generator.js";
import { name } from "../../src/prop/engine/store.js";
import { encode } from "../../src/prop/engine/token.js";
import { UNSTATED } from "../../src/prop/engine/trace.js";
import { float, integer } from "../../src/prop/generators.js";
import { keyOf, ofRecord } from "../../src/prop/identity.js";
import { differs, entryOf, storedOf, traceOf } from "../../src/prop/stored.js";
import { DEFINITION } from "../../src/record/call.js";
import { test as it } from "../../src/vitest.js";

/** The location of the failure of the executions. */
const WHERE = { file: "/work/tests/total.test.ts", line: 9 };

/** Returns the failed execution of c. */
function failedOf(c: Case): Execution {
  const failure = new Failure("equal", "the total", {}, WHERE);
  const identity = ofRecord(failure);
  return {
    case: c,
    status: "failed",
    failure: new Failed(keyOf(identity), { failure, identity }),
  };
}

/** Returns a failed execution that draws each generator once, under its label, from choices. */
function failing(
  choices: readonly Choice[],
  ...draws: [string, Generator<unknown>][]
): Execution {
  const c = new Case(new Replaying(choices));
  for (const [label, generator] of draws) {
    c.draw(generator, label);
  }
  return failedOf(c);
}

/** Returns the failed execution of a machine: a step of put, the draw of the digit 3 under x, and a step of get on client 1. */
function machine(): Execution {
  const c = new Case(new Replaying([int(3n)]));
  c.step({ action: "put" });
  c.draw(integer(0, 9), "x");
  c.step({ action: "get", client: 1 });
  return failedOf(c);
}

/** The entries of the counterexample of machine. */
const MACHINE = [
  { step: "put" },
  { label: "x", value: { type: "int", value: 3 } },
  { step: "get", client: 1 },
];

/** The choice of an integer. */
function int(value: bigint): Choice {
  return { kind: "integer", value };
}

describe("stored", () => {
  describe("entryOf", () => {
    it("returns the name and the entry of a failing case", ({ seat }) => {
      const execution = failing([int(3n)], ["x", integer(0, 9)]);

      check.isEqualTo(
        seat,
        entryOf("the total is positive", execution, "2026-10-08"),
        {
          name: name("the total is positive", [int(3n)]),
          entry: {
            store: 1,
            definition: DEFINITION,
            property: "the total is positive",
            identity: { assertion: "equal", file: "total.test.ts", line: 9 },
            choices: encode([int(3n)]),
            counterexample: [{ label: "x", value: { type: "int", value: 3 } }],
            found: "2026-10-08",
          },
        },
        "the entry records the case",
      );
    });

    it("records a draw whose value no literal states by its label alone", ({
      seat,
    }) => {
      const execution = failing([int(3n)], ["f", integer(0, 9).map(() => () => 1)]);

      check.isEqualTo(
        seat,
        entryOf("c", execution, "2026-10-08").entry["counterexample"],
        [{ label: "f" }],
        "the label alone",
      );
    });

    it("records the steps of a machine among its draws in format 2", ({ seat }) => {
      const { entry } = entryOf("c", machine(), "2026-11-10");

      check.isEqualTo(
        seat,
        [entry["store"], entry["counterexample"]],
        [2, MACHINE],
        "the steps in request order",
      );
    });

    it("records the drain mark of a step of the drain", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.step({ action: "deliver", drain: true });

      check.isEqualTo(
        seat,
        entryOf("c", failedOf(c), "2026-11-10").entry["counterexample"],
        [{ step: "deliver", drain: true }],
        "the step and its mark",
      );
    });
  });

  describe("differs", () => {
    const replayed = failing([int(3n)], ["x", integer(0, 9)]);

    const tests = [
      {
        name: "false for an entry of the replay's labels and values",
        give: [{ label: "x", value: { type: "int", value: 3 } }],
        want: false,
      },
      {
        name: "false for a draw that records no value",
        give: [{ label: "x" }],
        want: false,
      },
      { name: "true for another number of draws", give: [], want: true },
      {
        name: "true for another label",
        give: [{ label: "y", value: { type: "int", value: 3 } }],
        want: true,
      },
      {
        name: "true for another value",
        give: [{ label: "x", value: { type: "int", value: 4 } }],
        want: true,
      },
      {
        name: "true for a value that does not decode",
        give: [{ label: "x", value: { type: "bogus" } }],
        want: true,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.isEqualTo(seat, differs(tt.give, replayed), tt.want, "the verdict");
      });
    }

    it("returns false for an int that another implementation spells as a decimal string", ({
      seat,
    }) => {
      const big = failing([int(2n ** 64n - 1n)], ["x", integer(0n, 2n ** 64n - 1n)]);

      check.isFalse(
        seat,
        differs(
          [{ label: "x", value: { type: "int", value: "18446744073709551615" } }],
          big,
        ),
        "one value",
      );
    });

    it("returns true for a recorded -0 that replays as +0", ({ seat }) => {
      const zero = failing([{ kind: "float", value: 0 }], ["x", float(-1, 1)]);

      check.isTrue(
        seat,
        differs([{ label: "x", value: { type: "float", value: -0 } }], zero),
        "two zeros differ",
      );
    });

    it("returns true for a recorded value whose replay no literal states", ({
      seat,
    }) => {
      const opaque = failing([int(3n)], ["x", integer(0, 9).map(() => () => 1)]);

      check.isTrue(
        seat,
        differs([{ label: "x", value: { type: "int", value: 3 } }], opaque),
        "the replay has no value",
      );
    });

    const steps = [
      {
        name: "false for an entry of the replay's steps and draws",
        give: MACHINE,
        want: false,
      },
      {
        name: "false for an entry of the draws alone of a replay with steps",
        give: [MACHINE[1] as Record<string, unknown>],
        want: false,
      },
      {
        name: "true for an entry of another action",
        give: [{ step: "pop" }, ...MACHINE.slice(1)],
        want: true,
      },
      {
        name: "true for an entry of another client",
        give: [...MACHINE.slice(0, 2), { step: "get", client: 2 }],
        want: true,
      },
      {
        name: "true for an entry of a drain mark",
        give: [{ step: "put", drain: true }, ...MACHINE.slice(1)],
        want: true,
      },
      {
        name: "true for a step at another place among the draws",
        give: [MACHINE[1], MACHINE[0], MACHINE[2]] as Record<string, unknown>[],
        want: true,
      },
    ];
    for (const tt of steps) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.isEqualTo(seat, differs(tt.give, machine()), tt.want, "the verdict");
      });
    }
  });

  describe("traceOf", () => {
    it("returns the steps and the draws of an entry as a trace", ({ seat }) => {
      check.isEqualTo(
        seat,
        traceOf([...MACHINE, { step: "deliver", drain: true }]),
        [
          { action: "put" },
          { label: "x", value: 3n },
          { action: "get", client: 1 },
          { action: "deliver", drain: true },
        ],
        "the entries in request order",
      );
    });

    it("returns UNSTATED as the value of a draw that no typed literal states", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        traceOf([{ label: "x" }, { label: "y", value: { type: "bogus" } }]),
        [
          { label: "x", value: UNSTATED },
          { label: "y", value: UNSTATED },
        ],
        "a draw without a value and a value that does not decode",
      );
    });
  });

  describe("storedOf", () => {
    it("returns the stored case that matches a case of its counterexample", ({
      seat,
    }) => {
      const stored = storedOf(
        [int(3n)],
        [{ label: "x", value: { type: "int", value: 3 } }],
      );
      const matches = stored.matches as (execution: Execution) => boolean;

      check.isEqualTo(
        seat,
        [
          stored.choices,
          stored.trace,
          matches(failing([int(3n)], ["x", integer(0, 9)])),
          matches(failing([int(4n)], ["x", integer(0, 9)])),
        ],
        [[int(3n)], [{ label: "x", value: 3n }], true, false],
        "a case of 3 matches, and a case of 4 does not",
      );
    });
  });
});
