/** The spec of the binary floats of a float choice: their bits, widths, neighbours and sort key. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  bitsOf,
  compareKeys,
  floatKey,
  fromBits,
  fromBits32,
  INTEGRAL_LIMIT,
  type Key,
  NAN_BITS,
  nextDown,
  nextUp,
  representable,
  sameFloat,
  simplestFloat,
  type Width,
} from "../../../src/prop/engine/float.js";
import { test as it } from "../../../src/vitest.js";

/** The largest finite value of width 32, and the smallest positive one. */
const MAX_FLOAT32 = fromBits32(0x7f7fffffn);
const MIN_FLOAT32 = fromBits32(1n);

const INFINITY = Number.POSITIVE_INFINITY;

/** A case of a function of a float and a width. */
interface WidthCase<W> {
  readonly name: string;
  readonly give: readonly [number, Width];
  readonly want: W;
}

describe("float", () => {
  it("exports the canonical NaN and the end of the integral group", ({ seat }) => {
    check.equal(
      seat,
      [NAN_BITS, INTEGRAL_LIMIT],
      [0x7ff8000000000000n, 2 ** 53],
      "the two constants",
    );
  });

  describe("bitsOf", () => {
    it("returns the binary64 bits of a float", ({ seat }) => {
      check.equal(
        seat,
        [bitsOf(1), bitsOf(-0), bitsOf(Number.NaN)],
        [0x3ff0000000000000n, 1n << 63n, NAN_BITS],
        "the bits of 1, -0 and NaN",
      );
    });
  });

  describe("fromBits", () => {
    it("returns the float of binary64 bits", ({ seat }) => {
      check.equal(
        seat,
        [fromBits(0x3ff0000000000000n), fromBits(1n)],
        [1, Number.MIN_VALUE],
        "1 and the smallest subnormal",
      );
    });
  });

  describe("fromBits32", () => {
    it("returns the float of binary32 bits", ({ seat }) => {
      check.equal(
        seat,
        [fromBits32(0x3f800000n), MIN_FLOAT32, MAX_FLOAT32],
        [1, 2 ** -149, (2 - 2 ** -23) * 2 ** 127],
        "1, the smallest and the largest",
      );
    });
  });

  describe("representable", () => {
    const tests: WidthCase<boolean>[] = [
      { name: "true for any float of width 64", give: [0.1, 64] as const, want: true },
      { name: "true for a value of width 32", give: [0.5, 32] as const, want: true },
      { name: "false for a float off width 32", give: [0.1, 32] as const, want: false },
      { name: "true for NaN at width 32", give: [Number.NaN, 32] as const, want: true },
      {
        name: "true for infinity at width 32",
        give: [INFINITY, 32] as const,
        want: true,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, representable(...tt.give), tt.want, "the verdict");
      });
    }
  });

  describe("nextUp", () => {
    const tests: WidthCase<number>[] = [
      {
        name: "steps one unit up from 1 at width 32",
        give: [1, 32] as const,
        want: 1 + 2 ** -23,
      },
      {
        name: "steps from zero to the smallest subnormal at width 32",
        give: [0, 32] as const,
        want: MIN_FLOAT32,
      },
      {
        name: "steps from negative zero to the smallest subnormal at width 32",
        give: [-0, 32] as const,
        want: MIN_FLOAT32,
      },
      {
        name: "steps from the largest negative subnormal to negative zero at width 32",
        give: [-MIN_FLOAT32, 32] as const,
        want: -0,
      },
      {
        name: "steps from the largest finite value to infinity at width 32",
        give: [MAX_FLOAT32, 32] as const,
        want: INFINITY,
      },
      {
        name: "steps from negative infinity to the lowest finite value at width 32",
        give: [-INFINITY, 32] as const,
        want: -MAX_FLOAT32,
      },
      {
        name: "returns infinity for infinity",
        give: [INFINITY, 32] as const,
        want: INFINITY,
      },
      {
        name: "returns NaN for NaN",
        give: [Number.NaN, 64] as const,
        want: Number.NaN,
      },
      {
        name: "steps from zero to the smallest subnormal at width 64",
        give: [0, 64] as const,
        want: Number.MIN_VALUE,
      },
      {
        name: "steps one unit up from -1 at width 64",
        give: [-1, 64] as const,
        want: -1 + 2 ** -53,
      },
      {
        name: "steps one unit up from 1 at width 64",
        give: [1, 64] as const,
        want: 1 + 2 ** -52,
      },
    ];
    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.isTrue(
          seat,
          sameFloat(nextUp(...tt.give), tt.want),
          `the next value is ${tt.want}`,
        );
      });
    }
  });

  describe("nextDown", () => {
    const tests: WidthCase<number>[] = [
      {
        name: "steps from zero to the largest negative subnormal at width 32",
        give: [0, 32] as const,
        want: -MIN_FLOAT32,
      },
      {
        name: "steps one unit down from 1 at width 64",
        give: [1, 64] as const,
        want: 1 - 2 ** -53,
      },
    ];
    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.isTrue(
          seat,
          sameFloat(nextDown(...tt.give), tt.want),
          `the next value is ${tt.want}`,
        );
      });
    }
  });

  describe("sameFloat", () => {
    const tests = [
      { name: "false for the two zeros", give: [0, -0] as const, want: false },
      {
        name: "true for two NaN",
        give: [Number.NaN, -Number.NaN] as const,
        want: true,
      },
      { name: "false for NaN and zero", give: [Number.NaN, 0] as const, want: false },
      { name: "false for zero and NaN", give: [0, Number.NaN] as const, want: false },
      { name: "true for one value", give: [1.5, 1.5] as const, want: true },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, sameFloat(...tt.give), tt.want, "the verdict");
      });
    }
  });

  describe("floatKey", () => {
    it("orders the groups of floats from integral values to NaN", ({ seat }) => {
      const ordered = [
        0,
        -0,
        1,
        -1,
        2,
        2 ** 53,
        0.5,
        -0.5,
        1.5,
        0.25,
        INFINITY,
        -INFINITY,
        Number.NaN,
      ];
      const sorted = [...ordered]
        .reverse()
        .sort((a, b) => compareKeys(floatKey(a), floatKey(b)));

      check.isTrue(
        seat,
        sorted.every((v, i) => sameFloat(v, ordered[i] as number)),
        "the key order",
      );
    });

    const tests = [
      {
        name: "an integral key below 2^53",
        give: 2 ** 52 + 1,
        want: [0n, 2n ** 52n + 1n, 0n],
      },
      {
        name: "a fraction key without fractional bits at 2^53",
        give: 2 ** 53,
        want: [1n, 0n, 2n ** 53n, 0n],
      },
      {
        name: "the fractional bits and the numerator of -0.5",
        give: -0.5,
        want: [1n, 1n, 1n, 1n],
      },
      {
        name: "the infinite group with the sign of negative infinity",
        give: -INFINITY,
        want: [2n, 1n],
      },
      { name: "the NaN group alone for NaN", give: Number.NaN, want: [3n] },
      { name: "the integral key of zero", give: 0, want: [0n, 0n, 0n] },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, floatKey(tt.give), tt.want, "the key");
      });
    }
  });

  describe("compareKeys", () => {
    const tests: { name: string; give: readonly [Key, Key]; want: number }[] = [
      {
        name: "a negative number for a smaller first element",
        give: [
          [0n, 9n],
          [1n, 0n],
        ] as const,
        want: -1,
      },
      {
        name: "a positive number for a larger element after equal ones",
        give: [
          [1n, 2n],
          [1n, 1n],
        ] as const,
        want: 1,
      },
      {
        name: "a negative number for a prefix",
        give: [[1n], [1n, 0n]] as const,
        want: -1,
      },
      {
        name: "zero for equal keys",
        give: [
          [1n, 2],
          [1n, 2],
        ] as const,
        want: 0,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, Math.sign(compareKeys(...tt.give)), tt.want, "the order");
      });
    }
  });

  describe("simplestFloat", () => {
    const tests: {
      name: string;
      give: readonly [number, number, Width];
      want: number | undefined;
    }[] = [
      { name: "zero for a range around zero", give: [-1, 1, 64] as const, want: 0 },
      {
        name: "the smallest integer for a range of integers",
        give: [2.5, 7, 64] as const,
        want: 3,
      },
      {
        name: "the fraction with the fewest bits",
        give: [0.6, 0.7, 64] as const,
        want: 0.625,
      },
      {
        name: "the lower bound of a range whose lower bound is its simplest fraction",
        give: [2.5, 2.75, 64] as const,
        want: 2.5,
      },
      {
        name: "a mirrored value for a negative range",
        give: [-0.7, -0.6, 64] as const,
        want: -0.625,
      },
      {
        name: "the lower bound of integers beyond 2^53",
        give: [2 ** 53 + 2, 2 ** 60, 64] as const,
        want: 2 ** 53 + 2,
      },
      {
        name: "2^53 for a range of width 32 whose first integer rounds up to 2^53",
        give: [2 ** 53 - 2 ** 28, 2 ** 60, 32] as const,
        want: 2 ** 53,
      },
      {
        name: "the next value of width 32 above a lower bound off the width",
        give: [2 ** 53 + 2 ** 30 + 2, 2 ** 60, 32] as const,
        want: 2 ** 53 + 2 ** 31,
      },
      {
        name: "infinity for a range from infinity",
        give: [INFINITY, INFINITY, 64] as const,
        want: INFINITY,
      },
      {
        name: "1 for a range from 0.3 to infinity",
        give: [0.3, INFINITY, 64] as const,
        want: 1,
      },
      {
        name: "undefined for a range without a value of width 32",
        give: [2 ** 30 + 0.25, 2 ** 30 + 0.75, 32] as const,
        want: undefined,
      },
      {
        name: "undefined for a negative range without a value of width 32",
        give: [-(2 ** 30) - 0.75, -(2 ** 30) - 0.25, 32] as const,
        want: undefined,
      },
      {
        name: "undefined for a range of integers past the bound",
        give: [2 ** 53 + 2 ** 31 + 4, 2 ** 53 + 2 ** 31 + 8, 32] as const,
        want: undefined,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        const got = simplestFloat(...tt.give);

        check.isTrue(
          seat,
          tt.want === undefined
            ? got === undefined
            : got !== undefined && sameFloat(got, tt.want),
          `the simplest value is ${tt.want}`,
        );
      });
    }
  });
});
