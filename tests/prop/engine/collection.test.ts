/** The spec of collections: their sizes, their continue flags and their discards. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  Case,
  Generating,
  Rejected,
  Replaying,
} from "../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import {
  collect,
  ELEMENT,
  ENTRY,
  more,
  Sizes,
} from "../../../src/prop/engine/collection.js";
import { Edge } from "../../../src/prop/engine/edge.js";
import { Source } from "../../../src/prop/engine/source.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** The discards in a row that stop a collection, as the definition states it. */
const DISCARD_LIMIT = 10;

/** The bounds of each element that the cases decode. */
const DIGIT = new IntegerBounds(0n, 9n);

/** Returns a case that replays integer values. */
function replay(...values: bigint[]): Case {
  return new Case(new Replaying(values.map((value) => ({ kind: "integer", value }))));
}

/** Collects digits, each unique by its value when unique is set. */
function digits(
  c: Case,
  sizes: Sizes,
  unique: boolean,
  stop?: () => boolean,
): bigint[] {
  return collect(
    c,
    sizes,
    ELEMENT,
    () => {
      const value = c.integer(DIGIT);
      return [value, unique ? String(value) : undefined] as const;
    },
    stop,
  );
}

/** Returns count repetitions of values. */
function repeat(count: number, ...values: bigint[]): bigint[] {
  return Array.from({ length: count }, () => values).flat();
}

describe("collection", () => {
  it("exports the labels of an element or an entry", ({ seat }) => {
    check.equal(seat, [ELEMENT, ENTRY], ["element", "entry"], "the two labels");
  });

  describe("new Sizes", () => {
    const tests = [
      {
        name: "a negative minimum",
        give: [-1, undefined] as const,
        want: "prop: sizes [-1, undefined] are empty",
      },
      {
        name: "a maximum below the minimum",
        give: [3, 2] as const,
        want: "prop: sizes [3, 2] are empty",
      },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => new Sizes(...tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("Sizes.average", () => {
    it("returns the average length of the length rule", ({ seat }) => {
      check.equal(
        seat,
        [new Sizes().average, new Sizes(0, 1).average, new Sizes(10).average],
        [5, 1, 20],
        "three averages",
      );
    });
  });

  describe("more", () => {
    it("forces the flag below the minimum and at the maximum", ({ seat }) => {
      const c = replay(0n, 0n, 1n);
      const sizes = new Sizes(1, 2);
      const decided = [0, 1, 2].map((count) => more(c, count, sizes));

      check.equal(
        seat,
        [
          decided,
          c.requests.map((request) => request.bounds.id),
          c.requests.map((request) => request.edge),
        ],
        [
          [true, false, false],
          ["integer 1 1", "integer 0 1", "integer 0 0"],
          [1n, 0n, 0n],
        ],
        "the decisions, their bounds and their edges",
      );
    });

    it("stops a stopped collection as one at its maximum", ({ seat }) => {
      const c = replay(1n);

      check.equal(
        seat,
        [more(c, 3, new Sizes(), true), c.requests[0]?.bounds.id],
        [false, "integer 0 0"],
        "a forced stop",
      );
    });

    it("continues by a coin of the stated average", ({ seat }) => {
      const c = new Case(new Generating(new Source(12n)));
      const twin = new Source(12n);
      const got = Array.from({ length: 50 }, (_, count) =>
        more(c, count, new Sizes(0, 100), false, 30),
      );

      check.equal(
        seat,
        got,
        got.map(() => twin.coin(30n, 31n)),
        "a coin of 30 in 31",
      );
    });

    it("gives the first flag the edge 1", ({ seat }) => {
      const c = new Case(new Edge("min"));

      check.equal(
        seat,
        [more(c, 0, new Sizes()), more(c, 1, new Sizes())],
        [true, false],
        "one element",
      );
    });
  });

  describe("collect", () => {
    it("opens the span of each element at its flag", ({ seat }) => {
      const c = replay(1n, 7n, 1n, 3n, 0n);

      check.equal(
        seat,
        [digits(c, new Sizes(), false), c.spans],
        [
          [7n, 3n],
          [
            { label: ELEMENT, start: 0, end: 2, depth: 0, parent: undefined },
            { label: ELEMENT, start: 2, end: 4, depth: 0, parent: undefined },
          ],
        ],
        "a flag and an element in each span",
      );
    });

    it("keeps duplicates without a key", ({ seat }) => {
      check.equal(
        seat,
        digits(replay(1n, 4n, 1n, 4n, 0n), new Sizes(), false),
        [4n, 4n],
        "both fours",
      );
    });

    it("discards an element whose key repeats", ({ seat }) => {
      check.equal(
        seat,
        digits(replay(1n, 4n, 1n, 4n, 1n, 5n, 0n), new Sizes(), true),
        [4n, 5n],
        "the second four is discarded",
      );
    });

    it("continues after one discard fewer than the limit", ({ seat }) => {
      const values = [1n, 4n, ...repeat(DISCARD_LIMIT - 1, 1n, 4n), 1n, 5n, 0n];

      check.equal(
        seat,
        digits(replay(...values), new Sizes(), true),
        [4n, 5n],
        "nine discards",
      );
    });

    it("stops at the limit of discards without another flag", ({ seat }) => {
      const c = replay(1n, 4n, ...repeat(DISCARD_LIMIT, 1n, 4n), 1n, 5n, 0n);

      check.equal(
        seat,
        [digits(c, new Sizes(), true), c.choices.length],
        [[4n], 2 + 2 * DISCARD_LIMIT],
        "ten discards",
      );
    });

    it("restarts the count of discards after a new element", ({ seat }) => {
      const values = [
        1n,
        4n,
        ...repeat(DISCARD_LIMIT - 1, 1n, 4n),
        1n,
        5n,
        1n,
        5n,
        1n,
        6n,
        0n,
      ];

      check.equal(
        seat,
        digits(replay(...values), new Sizes(), true),
        [4n, 5n, 6n],
        "nine discards, then one",
      );
    });

    it("keeps a collection that stops at its minimum", ({ seat }) => {
      const c = replay(1n, 4n, ...repeat(DISCARD_LIMIT, 1n, 4n));

      check.equal(seat, digits(c, new Sizes(1), true), [4n], "the minimum of one");
    });

    it("throws Rejected for a collection that stops below its minimum", ({ seat }) => {
      const err = check.throws(
        seat,
        () => digits(replay(), new Sizes(2), true),
        "the targets repeat",
      );

      check.errorIs(seat, err, Rejected, "the case is rejected");
    });

    it("stops when stop returns true at the minimum", ({ seat }) => {
      const c = replay(1n, 4n, 1n, 5n, 1n, 6n);

      check.equal(
        seat,
        digits(c, new Sizes(1), false, () => true),
        [4n],
        "the flag after the minimum is forced to 0",
      );
    });

    it("asks stop only from the minimum on", ({ seat }) => {
      const asked: number[] = [];
      const c = replay(1n, 4n, 1n, 5n, 0n);
      digits(c, new Sizes(1), false, () => {
        asked.push(c.choices.length);
        return false;
      });

      check.equal(
        seat,
        asked,
        [2, 4],
        "stop is asked before the second and the third flag",
      );
    });
  });
});
