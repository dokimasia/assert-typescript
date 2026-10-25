// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the generators that contain other generators: what each
 * decodes from recorded choices, and what each draws from a source.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { Generating, Replaying } from "../../../../src/prop/engine/case/providers.js";
import { Rejected } from "../../../../src/prop/engine/case/signals.js";
import { Case, DECODE } from "../../../../src/prop/engine/case.js";
import {
  type Choice,
  IntegerBounds,
  type Value,
} from "../../../../src/prop/engine/choice.js";
import { Sizes } from "../../../../src/prop/engine/collection.js";
import * as draw from "../../../../src/prop/engine/draw.js";
import type { Generator } from "../../../../src/prop/engine/generator/base.js";
import {
  Composite,
  Dict,
  List,
  OneOf,
  Optional,
  Position,
  Recursive,
} from "../../../../src/prop/engine/generator/collections.js";
import { Bool, Integer } from "../../../../src/prop/engine/generator/scalars.js";
import { Source } from "../../../../src/prop/engine/source.js";
import { Pairs } from "../../../../src/prop/engine/value.js";
import { test as it } from "../../../../src/vitest.js";

/** Seeds per check of generation. */
const SEEDS = 200;

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const TEEN = new Integer(new IntegerBounds(10n, 20n));
const COIN = new Bool({ num: 1n, den: 2n });
const DIGITS = new List(DIGIT, new Sizes(0, 3));
const UNIQUE = new List(DIGIT, new Sizes(), true);
const TABLE = new Dict(DIGIT, COIN, new Sizes(0, 3));

/** Returns a tree of digits: a digit, or a list of at most three trees. */
function tree(maxLeaves = 100): Recursive<unknown> {
  return new Recursive<unknown>(
    DIGIT,
    maxLeaves,
    (self) => new List(self, new Sizes(0, 3)),
  );
}

/** Returns a recorded choice of the kind that the type of value implies. */
function choiceOf(value: Value): Choice {
  if (Array.isArray(value)) {
    return { kind: "sequence", value };
  }
  if (typeof value === "number") {
    return { kind: "float", value };
  }
  return { kind: "integer", value: value as bigint };
}

/** Returns a case that replays values. */
function replay(...values: Value[]): Case {
  return new Case(new Replaying(values.map(choiceOf)));
}

/** Returns the value that generator decodes from recorded values, and the case. */
function decode<T>(generator: Generator<T>, ...values: Value[]): [T, Case] {
  const c = replay(...values);
  return [generator[DECODE](c), c];
}

/** Returns the span labels of a case. */
function labels(c: Case): string[] {
  return c.spans.map((span) => span.label);
}

describe("collections", () => {
  describe("OneOf", () => {
    const either = new OneOf([DIGIT, TEEN]);

    it("decodes the value of the alternative at the recorded index", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(either, 1n, 15n)[0],
        15n,
        "the second alternative decodes 15",
      );
    });

    it("decodes the first alternative's simplest value from no choice", ({ seat }) => {
      check.isEqualTo(seat, decode(either)[0], 0n, "0");
    });

    it("decodes the target of the chosen alternative for a value outside it", ({
      seat,
    }) => {
      check.isEqualTo(seat, decode(either, 1n, 5n)[0], 10n, "5 is outside [10, 20]");
    });

    it("chooses its index as a structure choice in its span", ({ seat }) => {
      const [, c] = decode(either, 1n, 15n);

      check.isEqualTo(
        seat,
        [c.requests.map((request) => request.edge), c.spans[0]],
        [
          [0n, undefined],
          { label: "one-of", start: 0, end: 2, depth: 0, parent: undefined },
        ],
        "the index's edge and the span",
      );
    });
  });

  describe("Optional", () => {
    const maybe = new Optional(DIGIT);

    it("decodes undefined for an absent value with one choice", ({ seat }) => {
      const [value, c] = decode(maybe, 0n, 4n);

      check.isEqualTo(seat, [value, c.choices.length], [undefined, 1], "absent");
    });

    it("decodes the value of a present value", ({ seat }) => {
      check.isEqualTo(seat, decode(maybe, 1n, 4n)[0], 4n, "present");
    });

    it("decodes undefined from no choice", ({ seat }) => {
      check.isNil(seat, decode(maybe)[0], "the target is absent");
    });

    it("chooses its presence as a structure choice with the edge 1", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(maybe, 1n, 4n)[1].requests.map((request) => request.edge),
        [1n, undefined],
        "the edges",
      );
    });
  });

  describe("List", () => {
    it("decodes its flags and elements", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(DIGITS, 1n, 7n, 1n, 3n, 0n)[0],
        [7n, 3n],
        "two digits",
      );
    });

    it("decodes minSize simplest elements from no choice", ({ seat }) => {
      check.isEqualTo(
        seat,
        [decode(DIGITS)[0], decode(new List(DIGIT, new Sizes(2, 3)))[0]],
        [[], [0n, 0n]],
        "the targets",
      );
    });

    it("forces the flag at its maximum to stop", ({ seat }) => {
      const [value, c] = decode(DIGITS, 1n, 1n, 1n, 2n, 1n, 3n, 1n);

      check.isEqualTo(
        seat,
        [value, c.choices.at(-1), c.requests.at(-1)?.bounds.id],
        [[1n, 2n, 3n], { kind: "integer", value: 0n }, "integer 0 0"],
        "a recorded 1 replays as the stop",
      );
    });

    it("gives an edge to its flags alone", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(DIGITS, 1n, 7n, 1n, 3n, 0n)[1].requests.map((request) => request.edge),
        [1n, undefined, 0n, undefined, 0n],
        "the edges",
      );
    });

    it("opens the span of each element at its flag", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(DIGITS, 1n, 7n, 1n, 3n, 0n)[1].spans,
        [
          { label: "list", start: 0, end: 5, depth: 0, parent: undefined },
          { label: "element", start: 0, end: 2, depth: 1, parent: 0 },
          { label: "integer", start: 1, end: 2, depth: 2, parent: 1 },
          { label: "element", start: 2, end: 4, depth: 1, parent: 0 },
          { label: "integer", start: 3, end: 4, depth: 2, parent: 3 },
        ],
        "five spans",
      );
    });

    it("keeps duplicates of a list that is not unique", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(DIGITS, 1n, 4n, 1n, 4n, 0n)[0],
        [4n, 4n],
        "both fours",
      );
    });

    it("discards a duplicate element of a unique list", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(UNIQUE, 1n, 4n, 1n, 4n, 1n, 5n, 0n)[0],
        [4n, 5n],
        "the second four is discarded",
      );
    });

    it("throws Rejected for a unique list that remains below its minimum", ({
      seat,
    }) => {
      const err = check.doesThrow(
        seat,
        () => decode(new List(DIGIT, new Sizes(2), true)),
        "the targets repeat",
      );

      check.errorIs(seat, err, Rejected, "the case is rejected");
    });

    it("draws an element after each flag with the odds of reusing an earlier one", ({
      seat,
    }) => {
      const average = draw.averageLength(0, 3);
      const element = new IntegerBounds(0n, 9n);
      const got = Array.from({ length: SEEDS }, (_, seed) =>
        DIGITS[DECODE](new Case(new Generating(new Source(BigInt(seed))))),
      );
      const want = Array.from({ length: SEEDS }, (_, seed) => {
        const twin = new Source(BigInt(seed));
        const values: bigint[] = [];
        while (draw.flag(twin, values.length, 0, 3, average) === 1n) {
          if (values.length > 0 && twin.coin(1n, draw.REUSE_ODDS)) {
            values.push(values[Number(twin.below(BigInt(values.length)))] as bigint);
          } else {
            values.push(draw.integer(twin, element));
          }
        }
        return values;
      });

      check.isEqualTo(seat, got, want, "200 seeds");
    });
  });

  describe("Dict", () => {
    it("discards an entry whose key repeats", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(TABLE, 1n, 3n, 1n, 1n, 3n, 0n, 0n)[0],
        new Pairs([[3n, true]]),
        "the first entry of key 3",
      );
    });

    it("opens the span of each entry at its flag", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(TABLE, 1n, 3n, 1n, 0n)[1].spans.slice(0, 2),
        [
          { label: "dict", start: 0, end: 4, depth: 0, parent: undefined },
          { label: "entry", start: 0, end: 3, depth: 1, parent: 0 },
        ],
        "the dict and its entry",
      );
    });

    it("decodes no entry from no choice", ({ seat }) => {
      check.isEqualTo(seat, decode(TABLE)[0], new Pairs([]), "empty");
    });

    it("throws Rejected for a minimum of two that the targets cannot meet", ({
      seat,
    }) => {
      const err = check.doesThrow(
        seat,
        () => decode(new Dict(DIGIT, COIN, new Sizes(2, 3))),
        "both target keys are 0",
      );

      check.errorIs(seat, err, Rejected, "the case is rejected");
    });
  });

  describe("Composite", () => {
    it("decodes the value of its function in one span", ({ seat }) => {
      const pair = new Composite((inner) => [
        inner.draw(DIGIT, "a"),
        inner.draw(DIGIT, "b"),
      ]);
      const [value, c] = decode(pair, 1n, 2n);

      check.isEqualTo(
        seat,
        [value, c.spans[0]?.label],
        [[1n, 2n], "composite"],
        "a pair",
      );
    });
  });

  describe("Recursive", () => {
    it("decodes the base's simplest value from no choice", ({ seat }) => {
      check.isEqualTo(seat, decode(tree())[0], 0n, "the base");
    });

    it("decodes its positions recursively", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          decode(tree(), 1n, 1n, 0n, 5n, 1n, 0n, 7n, 0n)[0],
          decode(tree(), 1n, 1n, 1n, 1n, 0n, 3n, 0n, 0n)[0],
        ],
        [[5n, 7n], [[3n]]],
        "two leaves, and one a level deeper",
      );
    });

    it("decodes each position in a recursive span with a structure choice", ({
      seat,
    }) => {
      const [, c] = decode(tree(), 1n, 1n, 0n, 5n, 0n);

      check.isEqualTo(
        seat,
        [labels(c), c.requests[0]?.edge],
        [["recursive", "list", "element", "recursive", "integer"], 0n],
        "the labels and the edge of the first position",
      );
    });

    it("forces the base for each position after maxLeaves", ({ seat }) => {
      const [value, c] = decode(tree(1), 1n, 1n, 0n, 5n, 1n, 1n, 7n, 0n);

      check.isEqualTo(
        seat,
        [value, c.requests[5]?.bounds.id],
        [[5n, 7n], "integer 0 0"],
        "the second position takes the base",
      );
    });

    it("counts the leaves of each value from zero", ({ seat }) => {
      const one = tree(1);

      check.isEqualTo(
        seat,
        [decode(one, 1n, 1n, 0n, 5n, 0n)[0], decode(one, 1n, 1n, 0n, 5n, 0n)[0]],
        [[5n], [5n]],
        "two values",
      );
    });

    it("counts the leaves of the innermost recursive generator", ({ seat }) => {
      const outer = new Recursive<unknown>(
        tree(1),
        100,
        (self) => new List(self, new Sizes(0, 3)),
      );

      check.isEqualTo(
        seat,
        decode(outer, 0n, 1n, 1n, 0n, 5n, 1n, 1n, 7n, 0n)[0],
        [5n, 7n],
        "the inner tree's limit",
      );
    });
  });

  describe("Position", () => {
    it("decodes the next position of its owner inside the owner's extension", ({
      seat,
    }) => {
      const owner = tree();
      const position = new Position(owner);

      check.isEqualTo(
        seat,
        [position.owner === owner, decode(owner, 1n, 1n, 0n, 4n, 0n)[0]],
        [true, [4n]],
        "a list of one base position",
      );
    });
  });
});
