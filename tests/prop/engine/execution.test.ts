/** The spec of one call of a body, and each way that it can end. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  type Case,
  DECODE,
  type Decoder,
  MAX_CHOICES,
  Replaying,
} from "../../../src/prop/engine/case.js";
import { type Choice, IntegerBounds } from "../../../src/prop/engine/choice.js";
import {
  type Body,
  type Execution,
  execute,
  identityOf,
  unobserved,
} from "../../../src/prop/engine/execution.js";
import { Tree } from "../../../src/prop/engine/tree.js";
import { drive, type Work } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";

const DIGIT = new IntegerBounds(0n, 9n);
const BIT = new IntegerBounds(0n, 1n);

/** A generator of one digit. */
const DIGITS: Decoder<bigint> = { [DECODE]: (c: Case) => c.integer(DIGIT) };

/** A generator of one bit. */
const BITS: Decoder<bigint> = { [DECODE]: (c: Case) => c.integer(BIT) };

/** A body that draws a digit and passes. */
const draws: Body = (c) => {
  c.draw(DIGITS, "n");
  return undefined;
};

/** Returns integer choices of values. */
function integers(...values: bigint[]): Choice[] {
  return values.map((value) => ({ kind: "integer", value }));
}

/** Returns the execution of body on recorded choices. */
function run(
  body: Body,
  choices: Choice[] = [],
  tree?: Tree,
  maxChoices = MAX_CHOICES,
): Promise<Execution> {
  return drive(execute(body, new Replaying(choices), maxChoices, tree));
}

describe("execution", () => {
  describe("execute", () => {
    it("passes a body that returns", async ({ seat }) => {
      const execution = await run(draws, integers(4n));

      check.equal(
        seat,
        [execution.status, execution.case.draws[0]?.value, identityOf(execution)],
        ["passed", 4n, undefined],
        "a pass with its draw",
      );
    });

    it("passes a body whose work waits on a promise", async ({ seat }) => {
      function* waits(c: Case): Work<void> {
        const value = (yield Promise.resolve(3)) as number;
        c.note(`waited for ${value}`);
      }
      const execution = await run(waits);

      check.equal(
        seat,
        [execution.status, execution.case.notes],
        ["passed", ["waited for 3"]],
        "the work ran to its end",
      );
    });

    it("fails a body that fails its case with the failure's identity", async ({
      seat,
    }) => {
      const execution = await run((c) => c.fail("broken", "why"));

      check.equal(
        seat,
        [execution.status, identityOf(execution), execution.failure?.record],
        ["failed", "broken", "why"],
        "the failure",
      );
    });

    it("rejects a body that assumes false", async ({ seat }) => {
      const execution = await run((c) => {
        c.assume(false);
        return undefined;
      });

      check.equal(seat, execution.status, "rejected", "a rejection");
    });

    it("rejects a case past its cap", async ({ seat }) => {
      const two: Body = (c) => {
        c.draw(DIGITS, "a");
        c.draw(DIGITS, "b");
        return undefined;
      };

      check.equal(
        seat,
        (await run(two, [], undefined, 1)).status,
        "rejected",
        "two draws exceed one choice",
      );
    });

    it("rejects a case past its cap without a leaf", async ({ seat }) => {
      const tree = new Tree();
      const two: Body = (c) => {
        c.draw(DIGITS, "a");
        c.draw(DIGITS, "b");
        return undefined;
      };
      await run(two, integers(5n), tree, 1);

      check.isNil(
        seat,
        tree.root.children.get("5")?.ending,
        "the overrun leaves no leaf",
      );
    });

    it("throws an error of the body that is no signal", async ({ seat }) => {
      const err = await check.rejectsWith(
        seat,
        () =>
          run(() => {
            throw new TypeError("the body broke");
          }),
        "the error passes",
      );

      check.errorIs(seat, err, TypeError, "the body's error");
    });

    it("stops a case that repeats a leaf as repeated", async ({ seat }) => {
      const tree = new Tree();
      await run(draws, integers(4n), tree);

      check.equal(
        seat,
        (await run(draws, integers(4n), tree)).status,
        "repeated",
        "the second case of 4",
      );
    });

    it("stops a case that requests other bounds as diverged", async ({ seat }) => {
      const tree = new Tree();
      await run(draws, [], tree);
      const other = await run(
        (c) => {
          c.draw(BITS, "b");
          return undefined;
        },
        [],
        tree,
      );

      check.equal(
        seat,
        [other.status, other.divergence],
        [
          "diverged",
          {
            what: "request",
            index: 0,
            recorded: DIGIT,
            replayed: BIT,
            label: "b",
            step: undefined,
          },
        ],
        "the divergence of the request",
      );
    });

    it("states the place of a diverging request", async ({ seat }) => {
      const tree = new Tree();
      await run(draws, [], tree);
      const other = await run(
        (c) => {
          c.place = { part: "sequential", position: 3 };
          c.draw(BITS, "b");
          return undefined;
        },
        [],
        tree,
      );

      check.equal(
        seat,
        other.divergence?.step,
        { part: "sequential", position: 3 },
        "the step",
      );
    });

    it("stops a case that ends where another drew as diverged", async ({ seat }) => {
      const tree = new Tree();
      await run(draws, [], tree);
      const other = await run(() => undefined, [], tree);

      check.equal(
        seat,
        [other.status, other.divergence],
        [
          "diverged",
          {
            what: "request",
            index: 0,
            recorded: DIGIT,
            replayed: undefined,
            label: undefined,
            step: undefined,
          },
        ],
        "the divergence of the end",
      );
    });

    it("marks the leaf of a case with how it ended", async ({ seat }) => {
      const tree = new Tree();
      await run(
        (c) => {
          c.draw(DIGITS, "n");
          c.assume(false);
          return undefined;
        },
        integers(3n),
        tree,
      );

      check.equal(
        seat,
        tree.root.children.get("3")?.ending,
        "rejected",
        "a rejected leaf",
      );
    });
  });

  describe("identityOf", () => {
    it("returns undefined for a case that did not fail", async ({ seat }) => {
      check.isNil(seat, identityOf(await run(draws)), "a pass has no identity");
    });
  });

  describe("unobserved", () => {
    it("returns nothing for any call", ({ seat }) => {
      check.isNil(seat, unobserved(), "no observer");
    });
  });
});
