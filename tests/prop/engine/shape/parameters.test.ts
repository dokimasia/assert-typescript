// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the parameters of a shape's node, and of their refusals. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import * as alphabet from "../../../../src/prop/engine/alphabet.js";
import * as literal from "../../../../src/prop/engine/literal.js";
import {
  alphabetOf,
  bounded,
  countParameter,
  DECIMAL_BASE,
  fractionUnits,
  intParameter,
  isNode,
  NANOSECONDS,
  pairBounds,
  pairsOf,
  rangeOf,
  sizesOf,
  unitOf,
} from "../../../../src/prop/engine/shape/parameters.js";
import { test as it } from "../../../../src/vitest.js";
import { thrown } from "../../../helpers.js";

/** Returns a pair that a bound of a two-choice shape states as "first:second". */
function pairOf(text: unknown): readonly [bigint, bigint] {
  const [first, second] = String(text).split(":");
  return [BigInt(first as string), BigInt(second as string)];
}

describe("parameters", () => {
  describe("NANOSECONDS", () => {
    it("equals the nanoseconds in a second", ({ seat }) => {
      check.isEqualTo(seat, NANOSECONDS, 1_000_000_000n, "a billion");
    });
  });

  describe("DECIMAL_BASE", () => {
    it("equals the base of a decimal fraction", ({ seat }) => {
      check.isEqualTo(seat, DECIMAL_BASE, 10n, "ten");
    });
  });

  describe("intParameter", () => {
    it("returns an int that a JSON integer or a decimal string states", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          intParameter({ width: 8 }, "width", "shape"),
          intParameter({ min: "9007199254740993" }, "min", "shape"),
        ],
        [8n, 9_007_199_254_740_993n],
        "a safe and a large integer",
      );
    });

    it("throws a ShapeError with the literal's error as its cause", ({ seat }) => {
      let caught: unknown;
      try {
        intParameter({ width: 1.5 }, "width", "shape");
      } catch (err) {
        caught = err;
      }

      check.isEqualTo(
        seat,
        [(caught as Error).message, (caught as Error).cause instanceof Error],
        ["prop: shape.width is 1.5, not an integer", true],
        "the message and a cause",
      );
    });
  });

  describe("countParameter", () => {
    it("returns undefined for an absent or a null count", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          countParameter({}, "size", "shape"),
          countParameter({ size: null }, "size", "shape"),
        ],
        [undefined, undefined],
        "no count",
      );
    });

    it("returns a count of 0 or more as a number", ({ seat }) => {
      check.isEqualTo(seat, countParameter({ size: 3 }, "size", "shape"), 3, "3");
    });

    it("refuses a count below 0", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => countParameter({ size: -1 }, "size", "shape")),
        "prop: shape.size is -1, below 0",
        "the refusal",
      );
    });
  });

  describe("sizesOf", () => {
    it("returns the sizes from 0 without a bound by default", ({ seat }) => {
      const sizes = sizesOf({}, "shape");

      check.isEqualTo(seat, [sizes.minSize, sizes.maxSize], [0, undefined], "[0, ∞)");
    });

    it("returns the stated sizes", ({ seat }) => {
      const sizes = sizesOf({ min_size: 1, max_size: 4 }, "shape");

      check.isEqualTo(seat, [sizes.minSize, sizes.maxSize], [1, 4], "[1, 4]");
    });

    it("refuses a maximum below the minimum", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => sizesOf({ min_size: 3, max_size: 2 }, "shape")),
        "prop: shape: sizes [3, 2] are empty",
        "the refusal",
      );
    });
  });

  describe("unitOf", () => {
    it("returns the units in a second of each unit", ({ seat }) => {
      check.isEqualTo(
        seat,
        ["s", "ms", "us", "ns"].map((unit) => unitOf({ unit }, "shape")),
        [1n, 1_000n, 1_000_000n, 1_000_000_000n],
        "the four units",
      );
    });

    it("refuses a unit of no other name", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => unitOf({ unit: "min" }, "shape")),
        'prop: shape.unit is "min", not one of ms, ns, s, us',
        "the refusal",
      );
    });
  });

  describe("fractionUnits", () => {
    it("returns 0 for no digits", ({ seat }) => {
      check.isEqualTo(
        seat,
        [fractionUnits(undefined, 1_000n, "shape"), fractionUnits("", 1_000n, "shape")],
        [0n, 0n],
        "no fraction",
      );
    });

    it("returns the units that the digits state", ({ seat }) => {
      check.isEqualTo(seat, fractionUnits("5", 1_000n, "shape"), 500n, "half a second");
    });

    it("refuses digits finer than the unit", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => fractionUnits("0005", 1_000n, "shape")),
        "prop: shape states a fraction finer than its unit",
        "the refusal",
      );
    });
  });

  describe("rangeOf", () => {
    it("returns the fallback for absent bounds", ({ seat }) => {
      check.isEqualTo(
        seat,
        rangeOf({}, "shape", [0n, 9n], literal.integer),
        [0n, 9n],
        "the fallback",
      );
    });

    it("returns the bounds that min and max state", ({ seat }) => {
      check.isEqualTo(
        seat,
        rangeOf({ min: 2, max: 3 }, "shape", [0n, 9n], literal.integer),
        [2n, 3n],
        "[2, 3]",
      );
    });

    it("refuses bounds outside the fallback", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => rangeOf({ max: 10 }, "shape", [0n, 9n], literal.integer)),
        "prop: shape bounds [0, 10] are empty or outside [0, 9]",
        "the refusal",
      );
    });
  });

  describe("bounded", () => {
    it("returns the integer bounds that min and max state", ({ seat }) => {
      check.isEqualTo(
        seat,
        bounded({ min: 1 }, "shape", [0n, 9n], literal.integer).id,
        "integer 1 9",
        "[1, 9]",
      );
    });
  });

  describe("pairBounds", () => {
    it("returns the bounds that min and max state", ({ seat }) => {
      check.isEqualTo(
        seat,
        pairBounds(
          { min: "1:5", max: "2:0" },
          "shape",
          [
            [0n, 0n],
            [9n, 9n],
          ],
          pairOf,
        ),
        [
          [1n, 5n],
          [2n, 0n],
        ],
        "the two pairs",
      );
    });

    it("refuses a lower bound above the upper bound", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() =>
          pairBounds(
            { min: "2:1", max: "2:0" },
            "shape",
            [
              [0n, 0n],
              [9n, 9n],
            ],
            pairOf,
          ),
        ),
        "prop: shape bounds 2,1 to 2,0 are empty or out of range",
        "the refusal",
      );
    });
  });

  describe("isNode", () => {
    it("reports whether a value is a JSON object", ({ seat }) => {
      check.isEqualTo(
        seat,
        [isNode({}), isNode([]), isNode(null), isNode("shape")],
        [true, false, false, false],
        "an object alone",
      );
    });
  });

  describe("alphabetOf", () => {
    it("returns no characters and the size of the default alphabet without one", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        alphabetOf({}, "shape"),
        [undefined, alphabet.SIZE],
        "the default",
      );
    });

    it("returns the stated characters and their count", ({ seat }) => {
      check.isEqualTo(
        seat,
        alphabetOf({ alphabet: "ab" }, "shape"),
        [["a", "b"], 2],
        "two characters",
      );
    });

    const tests = [
      {
        name: "an empty alphabet",
        give: "",
        want: 'prop: shape.alphabet is "", not characters',
      },
      {
        name: "an alphabet that repeats a character",
        give: "aa",
        want: "prop: shape.alphabet repeats a character",
      },
      {
        name: "an alphabet with a lone surrogate",
        give: "a\uD800",
        want: "prop: shape.alphabet has a lone surrogate, which is no character",
      },
    ];
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => alphabetOf({ alphabet: tt.give }, "shape")),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("pairsOf", () => {
    it("returns the names and the shapes in order", ({ seat }) => {
      check.isEqualTo(
        seat,
        pairsOf(
          {
            fields: [
              ["a", 1],
              ["b", 2],
            ],
          },
          "fields",
          "shape",
        ),
        [
          ["a", 1],
          ["b", 2],
        ],
        "two pairs",
      );
    });

    const tests = [
      {
        name: "an empty list",
        give: [],
        want: "prop: shape.fields is [], not a list of pairs",
      },
      {
        name: "an item that is no pair",
        give: ["a"],
        want: 'prop: shape.fields has "a", not a name and a shape',
      },
      {
        name: "a name stated twice",
        give: [
          ["a", 1],
          ["a", 2],
        ],
        want: 'prop: shape.fields names "a" twice or not at all',
      },
      {
        name: "an empty name",
        give: [["", 1]],
        want: 'prop: shape.fields names "" twice or not at all',
      },
    ];
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => pairsOf({ fields: tt.give }, "fields", "shape")),
          tt.want,
          "the refusal",
        );
      });
    }
  });
});
