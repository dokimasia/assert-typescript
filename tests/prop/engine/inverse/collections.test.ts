// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the inverses of the generators that contain other
 * generators.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { IntegerBounds } from "../../../../src/prop/engine/choice.js";
import { Sizes } from "../../../../src/prop/engine/collection.js";
import {
  Bool,
  Composite,
  Dict,
  Filter,
  type Generator,
  Integer,
  List,
  Mapped,
  OneOf,
  Optional,
  Recursive,
} from "../../../../src/prop/engine/generator.js";
import { COLLECTIONS } from "../../../../src/prop/engine/inverse/collections.js";
import {
  CannotInvert,
  NoInverse,
} from "../../../../src/prop/engine/inverse/refusal.js";
import { PLACEHOLDER } from "../../../../src/prop/engine/inverse/steps.js";
import { Pairs } from "../../../../src/prop/engine/value.js";
import { test as it } from "../../../../src/vitest.js";
import { emittedBy, refusedBy } from "../../../helpers.js";

/** A digit. */
const DIGIT = new Integer(new IntegerBounds(0n, 9n));

/** An integer of 10 to 20. */
const TEEN = new Integer(new IntegerBounds(10n, 20n));

/** A list of at most three digits. */
const DIGITS = new List(DIGIT, new Sizes(0, 3));

/** A composite of two digits drawn under a and b, whose value is their list. */
const PAIR = new Composite((c) => [c.draw(DIGIT, "a"), c.draw(DIGIT, "b")]);

/**
 * Returns the values of the steps that the emitter of generator emits for
 * value, with each placeholder of a composite as the placeholder.
 */
function valuesOf(generator: Generator<unknown>, value: unknown): unknown[] {
  return emittedBy(COLLECTIONS, generator, value)[0].map((s) =>
    s === PLACEHOLDER ? s : s.value,
  );
}

describe("collections", () => {
  describe("COLLECTIONS", () => {
    it("lists the classes of the generators that contain other generators", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        COLLECTIONS.map(([kind]) => (kind as { name: string }).name),
        [
          "OneOf",
          "Optional",
          "OptionalShape",
          "List",
          "ListShape",
          "Dict",
          "MapShape",
          "Filter",
          "Composite",
          "Mapped",
          "Recursive",
          "Position",
        ],
        "the classes",
      );
    });

    it("emits the index of the first alternative that produces the value", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        valuesOf(new OneOf([DIGIT, TEEN]), 15n),
        [1n, 15n],
        "the index 1, then the step of 15",
      );
    });

    it("refuses with a NoInverse when no alternative produces the value and one has no inverse", ({
      seat,
    }) => {
      const identity = new Mapped(DIGIT, (value: bigint) => value);

      check.errorAs(
        seat,
        check.doesThrow(
          seat,
          () => emittedBy(COLLECTIONS, new OneOf([identity, DIGIT]), 15n),
          "the value is refused",
        ),
        NoInverse,
        "a NoInverse",
      );
    });

    it("emits an absent optional value as the choice 0", ({ seat }) => {
      check.isEqualTo(
        seat,
        valuesOf(new Optional(DIGIT), undefined),
        [0n],
        "the choice 0",
      );
    });

    it("emits a present optional value as the choice 1 and its steps", ({ seat }) => {
      check.isEqualTo(seat, valuesOf(new Optional(DIGIT), 3n), [1n, 3n], "1, then 3");
    });

    it("emits a flag before each element of a list and a stop after the last", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        valuesOf(DIGITS, [3n, 4n]),
        [1n, 3n, 1n, 4n, 0n],
        "the flags",
      );
    });

    it("refuses a list of more items than its sizes allow", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(COLLECTIONS, DIGITS, [1n, 2n, 3n, 4n]),
        "prop: 4 items are outside the collection's sizes",
        "the refusal",
      );
    });

    it("refuses a list of unique elements that repeats one", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(COLLECTIONS, new List(DIGIT, new Sizes(0, 3), true), [1n, 1n]),
        "prop: list:[int:1,int:1] repeats a value",
        "the refusal",
      );
    });

    it("refuses a dict that repeats a key", ({ seat }) => {
      const dict = new Dict(DIGIT, new Bool({ num: 1n, den: 2n }), new Sizes(0, 3));

      check.isEqualTo(
        seat,
        refusedBy(
          COLLECTIONS,
          dict,
          new Pairs([
            [1n, true],
            [1n, false],
          ]),
        ),
        "prop: list:[int:1,int:1] repeats a value",
        "the refusal",
      );
    });

    it("refuses a value that a filter rejects", ({ seat }) => {
      const even = new Filter(DIGIT, (value) => value % 2n === 0n);

      check.isEqualTo(
        seat,
        refusedBy(COLLECTIONS, even, 3n),
        "prop: the filter rejects int:3",
        "the refusal",
      );
    });

    it("refuses with a NoInverse a map without an inverse", ({ seat }) => {
      const identity = new Mapped(DIGIT, (value: bigint) => value);

      check.errorAs(
        seat,
        check.doesThrow(
          seat,
          () => emittedBy(COLLECTIONS, identity, 3n),
          "the value is refused",
        ),
        NoInverse,
        "a NoInverse",
      );
    });

    it("refuses a value whose inverse throws, with the error as its cause", ({
      seat,
    }) => {
      const cause = new RangeError("no digit");
      const mapped = new Mapped(
        DIGIT,
        (value: bigint) => String(value),
        () => {
          throw cause;
        },
      );
      const err = check.errorAs(
        seat,
        check.doesThrow(
          seat,
          () => emittedBy(COLLECTIONS, mapped, "x"),
          "the value is refused",
        ),
        CannotInvert,
        "a CannotInvert",
      );

      check.isEqualTo(seat, err?.cause, cause, "the cause");
    });

    it("emits the base of a recursive value before its extension", ({ seat }) => {
      const tree = new Recursive<unknown>(
        DIGIT,
        100,
        (self) => new List(self, new Sizes(0, 3)),
      );

      check.isEqualTo(seat, valuesOf(tree, 5n), [0n, 5n], "the base, then 5");
    });

    it("emits the placeholder of a composite", ({ seat }) => {
      check.isEqualTo(seat, valuesOf(PAIR, [7n, 3n]), [PLACEHOLDER], "the placeholder");
    });

    it("emits the first alternative without a composite before one through a composite", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        [
          valuesOf(new OneOf<unknown>([PAIR, DIGIT]), 7n),
          valuesOf(new OneOf([PAIR]), 7n),
        ],
        [
          [1n, 7n],
          [0n, PLACEHOLDER],
        ],
        "the digit first, and the pair when no other alternative produces 7",
      );
    });

    it("does not compare the composites of a unique list", ({ seat }) => {
      check.isEqualTo(
        seat,
        valuesOf(new List(PAIR, new Sizes(0, 3), true), [
          [1n, 2n],
          [1n, 2n],
        ]),
        [1n, PLACEHOLDER, 1n, PLACEHOLDER, 0n],
        "the flags around the pairs",
      );
    });

    it("refuses with a NoInverse a dict through a composite", ({ seat }) => {
      const err = check.errorAs(
        seat,
        check.doesThrow(
          seat,
          () =>
            emittedBy(
              COLLECTIONS,
              new Dict(DIGIT, PAIR, new Sizes(0, 2)),
              new Pairs([[5n, [1n, 2n]]]),
            ),
          "the value is refused",
        ),
        NoInverse,
        "a NoInverse",
      );

      check.isEqualTo(
        seat,
        err?.message,
        "prop: a map does not state the order in which its composites drew",
        "the refusal states the order",
      );
    });

    it("does not test the value of a composite of a filter", ({ seat }) => {
      const longer = new Filter(PAIR, (value: bigint[]) => value.length >= 2);

      check.isEqualTo(seat, valuesOf(longer, [7n]), [PLACEHOLDER], "the placeholder");
    });

    it("emits the given value of a map with an inverse of a composite", ({ seat }) => {
      const joined = new Mapped(
        PAIR,
        (value: bigint[]) => value.join(" "),
        (text: string) => text.split(" ").map(BigInt),
      );

      check.isEqualTo(
        seat,
        emittedBy(COLLECTIONS, joined, "7 3"),
        [[PLACEHOLDER], "7 3"],
        "the placeholder and the given value",
      );
    });
  });
});
