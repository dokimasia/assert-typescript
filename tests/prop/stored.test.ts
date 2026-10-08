/** The spec of the entries of a property's store. */

import { describe } from "vitest";
import { Failure } from "../../src/failure.js";
import { check } from "../../src/index.js";
import { Case, Failed, Replaying } from "../../src/prop/engine/case.js";
import type { Choice } from "../../src/prop/engine/choice.js";
import type { Execution } from "../../src/prop/engine/execution.js";
import type { Generator } from "../../src/prop/engine/generator.js";
import { name } from "../../src/prop/engine/store.js";
import { encode } from "../../src/prop/engine/token.js";
import { float, integer } from "../../src/prop/generators.js";
import { keyOf, ofRecord } from "../../src/prop/identity.js";
import { differs, entryOf } from "../../src/prop/stored.js";
import { test as it } from "../../src/vitest.js";

/** The location of the failure of the executions. */
const WHERE = { file: "/work/tests/total.test.ts", line: 9 };

/** Returns a failed execution that draws each generator once, under its label, from choices. */
function failing(
  choices: readonly Choice[],
  ...draws: [string, Generator<unknown>][]
): Execution {
  const c = new Case(new Replaying(choices));
  for (const [label, generator] of draws) c.draw(generator, label);
  const failure = new Failure("equal", "the total", {}, WHERE);
  const identity = ofRecord(failure);
  return {
    case: c,
    status: "failed",
    failure: new Failed(keyOf(identity), { failure, identity }),
  };
}

/** The choice of an integer. */
function int(value: bigint): Choice {
  return { kind: "integer", value };
}

describe("stored", () => {
  describe("entryOf", () => {
    it("returns the name and the entry of a failing case", ({ seat }) => {
      const execution = failing([int(3n)], ["x", integer(0, 9)]);

      check.equal(
        seat,
        entryOf("the total is positive", execution, "2026-10-08"),
        {
          name: name("the total is positive", [int(3n)]),
          entry: {
            store: 1,
            definition: "7.2.1",
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

      check.equal(
        seat,
        entryOf("c", execution, "2026-10-08").entry["counterexample"],
        [{ label: "f" }],
        "the label alone",
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
        check.equal(seat, differs(tt.give, replayed), tt.want, "the verdict");
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
  });
});
