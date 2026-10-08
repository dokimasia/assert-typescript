/** The spec of the three kinds of choice: their bounds, targets, sort keys and replay rules. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  type Choice,
  choiceOf,
  FloatBounds,
  INT64_MAX,
  INT64_MIN,
  IntegerBounds,
  SequenceBounds,
  sameChoice,
  UINT64_MAX,
} from "../../../src/prop/engine/choice.js";
import {
  bitsOf,
  compareKeys,
  fromBits32,
  type Key,
  NAN_BITS,
  sameFloat,
  type Width,
} from "../../../src/prop/engine/float.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** Returns values sorted by key. */
function sortedBy<T>(values: readonly T[], key: (value: T) => Key): T[] {
  return [...values].sort((a, b) => compareKeys(key(a), key(b)));
}

/** Returns the integers from lo to hi. */
function range(lo: bigint, hi: bigint): bigint[] {
  return Array.from({ length: Number(hi - lo + 1n) }, (_, i) => lo + BigInt(i));
}

/** The smallest positive value of width 32. */
const TINY32 = fromBits32(1n);

describe("choice", () => {
  it("exports the bounds of the signed and the unsigned 64-bit ranges", ({ seat }) => {
    check.equal(
      seat,
      [INT64_MIN, INT64_MAX, UINT64_MAX],
      [-(2n ** 63n), 2n ** 63n - 1n, 2n ** 64n - 1n],
      "the three bounds",
    );
  });

  describe("choiceOf", () => {
    it("returns the choice of the kind of the bounds", ({ seat }) => {
      check.equal(
        seat,
        choiceOf(new SequenceBounds(4), [1, 2]),
        { kind: "sequence", value: [1, 2] },
        "a sequence choice",
      );
    });
  });

  describe("new IntegerBounds", () => {
    const tests: { name: string; give: readonly [bigint, bigint]; want: bigint }[] = [
      { name: "zero for bounds around zero", give: [-5n, 5n] as const, want: 0n },
      { name: "zero for bounds from zero", give: [0n, 9n] as const, want: 0n },
      {
        name: "the lower bound for positive bounds",
        give: [3n, 9n] as const,
        want: 3n,
      },
      {
        name: "the upper bound for negative bounds",
        give: [-9n, -3n] as const,
        want: -3n,
      },
      {
        name: "the one value of bounds of one value",
        give: [7n, 7n] as const,
        want: 7n,
      },
    ];
    for (const tt of tests) {
      it(`targets ${tt.name}`, ({ seat }) => {
        check.equal(seat, new IntegerBounds(...tt.give).target, tt.want, "the target");
      });
    }

    it("accepts the whole signed and the whole unsigned 64-bit range", ({ seat }) => {
      const ids = [
        new IntegerBounds(INT64_MIN, INT64_MAX).id,
        new IntegerBounds(0n, UINT64_MAX).id,
      ];

      check.equal(
        seat,
        ids,
        [`integer ${INT64_MIN} ${INT64_MAX}`, `integer 0 ${UINT64_MAX}`],
        "both ranges",
      );
    });

    const refusals: { name: string; give: readonly [bigint, bigint]; want: string }[] =
      [
        {
          name: "empty bounds",
          give: [5n, 4n] as const,
          want: "prop: integer bounds [5, 4] are empty",
        },
        {
          name: "bounds that span both ranges",
          give: [-1n, UINT64_MAX] as const,
          want: `prop: integer bounds [-1, ${UINT64_MAX}] are inside neither the signed nor the unsigned 64-bit range`,
        },
        {
          name: "bounds below the signed range",
          give: [INT64_MIN - 1n, 0n] as const,
          want: `prop: integer bounds [${INT64_MIN - 1n}, 0] are inside neither the signed nor the unsigned 64-bit range`,
        },
      ];
    for (const tt of refusals) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => new IntegerBounds(...tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("IntegerBounds.key", () => {
    it("orders the values by their distance to the target with the value above first", ({
      seat,
    }) => {
      const bounds = new IntegerBounds(-2n, 2n);

      check.equal(
        seat,
        sortedBy(range(-2n, 2n), (v) => bounds.key(v)),
        [0n, 1n, -1n, 2n, -2n],
        "the key order",
      );
    });
  });

  describe("IntegerBounds.rank", () => {
    it("numbers the values in key order", ({ seat }) => {
      const all = [
        [-5n, 10n],
        [-10n, 5n],
        [3n, 9n],
        [-9n, -3n],
        [-4n, 4n],
        [7n, 7n],
        [-1n, 0n],
      ] as const;
      const got = all.map(([lo, hi]) => {
        const bounds = new IntegerBounds(lo, hi);
        return sortedBy(range(lo, hi), (v) => bounds.key(v)).map((v) => bounds.rank(v));
      });

      check.equal(
        seat,
        got,
        all.map(([lo, hi]) => range(0n, hi - lo)),
        "the ranks of the sorted values",
      );
    });

    it("returns the last rank for the largest unsigned value", ({ seat }) => {
      check.equal(
        seat,
        new IntegerBounds(0n, UINT64_MAX).rank(UINT64_MAX),
        UINT64_MAX,
        "the last rank",
      );
    });
  });

  describe("IntegerBounds.atRank", () => {
    it("returns the values in key order", ({ seat }) => {
      const all = [
        [-5n, 10n],
        [-10n, 5n],
        [3n, 9n],
        [-9n, -3n],
        [-4n, 4n],
        [7n, 7n],
        [-1n, 0n],
      ] as const;
      const got = all.map(([lo, hi]) => {
        const bounds = new IntegerBounds(lo, hi);
        return range(0n, hi - lo).map((r) => bounds.atRank(r));
      });
      const want = all.map(([lo, hi]) => {
        const bounds = new IntegerBounds(lo, hi);
        return sortedBy(range(lo, hi), (v) => bounds.key(v));
      });

      check.equal(seat, got, want, "the sorted values");
    });

    it("continues on the longer side past the end of the shorter one", ({ seat }) => {
      const bounds = new IntegerBounds(-2n, 9n);

      check.equal(
        seat,
        [4n, 5n, 6n, 7n].map((r) => bounds.atRank(r)),
        [-2n, 3n, 4n, 5n],
        "after -2 come 3, 4 and 5",
      );
    });

    it("returns the largest unsigned value at the last rank", ({ seat }) => {
      check.equal(
        seat,
        new IntegerBounds(0n, UINT64_MAX).atRank(UINT64_MAX),
        UINT64_MAX,
        "the last value",
      );
    });
  });

  describe("IntegerBounds.admits", () => {
    const tests = [
      { name: "an integer inside the bounds", give: 4n, want: true },
      { name: "an integer above the bounds", give: 10n, want: false },
      { name: "a number", give: 4, want: false },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want} for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          new IntegerBounds(3n, 9n).admits(tt.give),
          tt.want,
          "the verdict",
        );
      });
    }
  });

  describe("IntegerBounds.coerce", () => {
    it("returns a recorded integer inside the bounds", ({ seat }) => {
      check.equal(
        seat,
        new IntegerBounds(0n, 9n).coerce({ kind: "integer", value: 4n }),
        4n,
        "the recorded value",
      );
    });

    const tests: { name: string; give: Choice }[] = [
      { name: "an integer outside the bounds", give: { kind: "integer", value: 10n } },
      { name: "a float", give: { kind: "float", value: 4 } },
      { name: "a sequence", give: { kind: "sequence", value: [4] } },
    ];
    for (const tt of tests) {
      it(`returns the target for ${tt.name}`, ({ seat }) => {
        check.equal(seat, new IntegerBounds(3n, 9n).coerce(tt.give), 3n, "the target");
      });
    }
  });

  describe("new FloatBounds", () => {
    const tests = [
      { name: "zero inside [-1, 1]", give: [-1, 1, 64] as const, want: 0 },
      {
        name: "the simplest integer inside [2.5, 7]",
        give: [2.5, 7, 64] as const,
        want: 3,
      },
      {
        name: "the simplest negative integer inside [-7, -2.5]",
        give: [-7, -2.5, 64] as const,
        want: -3,
      },
      {
        name: "the fraction with the fewest bits inside [0.1, 0.9]",
        give: [0.1, 0.9, 64] as const,
        want: 0.5,
      },
      {
        name: "the fraction with the fewest bits inside [0.6, 0.7]",
        give: [0.6, 0.7, 64] as const,
        want: 0.625,
      },
      {
        name: "the fraction with the fewest bits of width 32",
        give: [0.5625, 0.6875, 32] as const,
        want: 0.625,
      },
      {
        name: "the lower bound of integers beyond 2^53",
        give: [2 ** 53 + 2, 2 ** 60, 64] as const,
        want: 2 ** 53 + 2,
      },
      {
        name: "the lower bound of a range to infinity",
        give: [1e300, Number.POSITIVE_INFINITY, 64] as const,
        want: 1e300,
      },
      {
        name: "infinity for bounds of infinity alone",
        give: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 64] as const,
        want: Number.POSITIVE_INFINITY,
      },
      {
        name: "negative infinity for bounds of it alone",
        give: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, 64] as const,
        want: Number.NEGATIVE_INFINITY,
      },
      {
        name: "the smallest positive value of width 32 for bounds of it alone",
        give: [TINY32, TINY32, 32] as const,
        want: TINY32,
      },
    ];
    for (const tt of tests) {
      it(`targets ${tt.name}`, ({ seat }) => {
        const [lo, hi, width] = tt.give;

        check.isTrue(
          seat,
          sameFloat(new FloatBounds(lo, hi, false, width).target, tt.want),
          "the target",
        );
      });
    }

    it("states its bounds in its id", ({ seat }) => {
      check.equal(
        seat,
        new FloatBounds(-1, 1, true, 32).id,
        "float -1 1 true 32",
        "the id",
      );
    });

    const refusals = [
      {
        name: "a width of 16",
        give: [0, 1, 16] as const,
        want: "prop: float width 16 is neither 32 nor 64",
      },
      {
        name: "a NaN bound",
        give: [Number.NaN, 1, 64] as const,
        want: "prop: float bounds [NaN, 1] are empty",
      },
      {
        name: "a lower bound above the upper",
        give: [1, 0, 64] as const,
        want: "prop: float bounds [1, 0] are empty",
      },
      {
        name: "a bound that is no value of the width",
        give: [0.1, 1, 32] as const,
        want: "prop: float bound 0.1 is no value of width 32",
      },
    ];
    for (const tt of refusals) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        const [lo, hi, width] = tt.give;

        check.equal(
          seat,
          thrown(() => new FloatBounds(lo, hi, false, width as Width)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("FloatBounds.key", () => {
    it("orders the keys of floats from integral values to NaN", ({ seat }) => {
      const bounds = new FloatBounds(
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        true,
      );
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
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NaN,
      ];
      const sorted = sortedBy([...ordered].reverse(), (v) => bounds.key(v));

      check.isTrue(
        seat,
        sorted.every((v, i) => sameFloat(v, ordered[i] as number)),
        "the key order",
      );
    });
  });

  describe("FloatBounds.admits", () => {
    const tests = [
      { name: "a float inside the bounds", give: 1.5, want: true },
      { name: "a float outside the bounds", give: 3, want: false },
      { name: "a float off the width", give: 1.1, want: false },
      { name: "NaN that the bounds refuse", give: Number.NaN, want: false },
      { name: "a bigint", give: 1n, want: false },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want} for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          new FloatBounds(1, 2, false, 32).admits(tt.give),
          tt.want,
          "the verdict",
        );
      });
    }

    it("returns true for NaN where the bounds allow it", ({ seat }) => {
      check.isTrue(
        seat,
        new FloatBounds(0, 1, true).admits(Number.NaN),
        "NaN is a value",
      );
    });
  });

  describe("FloatBounds.coerce", () => {
    it("returns a recorded float inside the bounds with its sign", ({ seat }) => {
      check.isTrue(
        seat,
        Object.is(new FloatBounds(-1, 1).coerce({ kind: "float", value: -0 }), -0),
        "-0 comes back",
      );
    });

    it("returns the canonical NaN for a recorded NaN with a payload", ({ seat }) => {
      const payload = -Number.NaN;

      check.equal(
        seat,
        bitsOf(new FloatBounds(0, 1, true).coerce({ kind: "float", value: payload })),
        NAN_BITS,
        "the canonical bits",
      );
    });

    const tests: { name: string; give: Choice }[] = [
      { name: "a float outside the bounds", give: { kind: "float", value: 3 } },
      {
        name: "NaN that the bounds refuse",
        give: { kind: "float", value: Number.NaN },
      },
      { name: "a float off the width", give: { kind: "float", value: 1.1 } },
      { name: "an integer", give: { kind: "integer", value: 1n } },
    ];
    for (const tt of tests) {
      it(`returns the target for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          new FloatBounds(1, 2, false, 32).coerce(tt.give),
          1,
          "the target",
        );
      });
    }
  });

  describe("new SequenceBounds", () => {
    it("targets minSize zeros", ({ seat }) => {
      check.equal(seat, new SequenceBounds(256, 3, 8).target, [0, 0, 0], "three zeros");
    });

    it("states its bounds in its id", ({ seat }) => {
      check.equal(
        seat,
        new SequenceBounds(256, 1).id,
        "sequence 256 1 undefined",
        "the id",
      );
    });

    const refusals: {
      name: string;
      give: readonly [number, number, number | undefined];
      want: string;
    }[] = [
      {
        name: "no element value",
        give: [0, 0, undefined] as const,
        want: "prop: a sequence with k = 0 has no element",
      },
      {
        name: "a negative minimum",
        give: [2, -1, undefined] as const,
        want: "prop: sequence sizes [-1, undefined] are empty",
      },
      {
        name: "a maximum below the minimum",
        give: [2, 3, 2] as const,
        want: "prop: sequence sizes [3, 2] are empty",
      },
    ];
    for (const tt of refusals) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => new SequenceBounds(...tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("SequenceBounds.key", () => {
    it("orders sequences by length before their elements", ({ seat }) => {
      const bounds = new SequenceBounds(4);
      const values = [[1, 0], [0, 0], [1], [0, 1]];

      check.equal(
        seat,
        sortedBy(values, (v) => bounds.key(v)),
        [[1], [0, 0], [0, 1], [1, 0]],
        "the key order",
      );
    });
  });

  describe("SequenceBounds.admits", () => {
    const tests = [
      { name: "a sequence of the sizes", give: [2] as unknown, want: true },
      { name: "a sequence below the minimum", give: [] as unknown, want: false },
      { name: "a sequence above the maximum", give: [0, 0, 0] as unknown, want: false },
      { name: "an element of k", give: [3] as unknown, want: false },
      { name: "a fractional element", give: [1.5] as unknown, want: false },
      { name: "a value that is no array", give: 1 as unknown, want: false },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want} for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          new SequenceBounds(3, 1, 2).admits(tt.give),
          tt.want,
          "the verdict",
        );
      });
    }

    it("returns true for a long sequence without a maximum", ({ seat }) => {
      check.isTrue(
        seat,
        new SequenceBounds(3).admits(new Array<number>(100).fill(2)),
        "no maximum",
      );
    });
  });

  describe("SequenceBounds.coerce", () => {
    const tests = [
      {
        name: "cuts a recorded sequence to the maximum",
        give: [1, 2, 3, 4, 5],
        want: [1, 2, 3, 4],
      },
      {
        name: "extends a recorded sequence with zeros to the minimum",
        give: [7],
        want: [7, 0],
      },
      {
        name: "replaces each element outside [0, k) with 0",
        give: [11, -1, 3],
        want: [0, 0, 3],
      },
    ];
    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          new SequenceBounds(10, 2, 4).coerce({ kind: "sequence", value: tt.give }),
          tt.want,
          "the fitted sequence",
        );
      });
    }

    it("keeps every element without a maximum", ({ seat }) => {
      check.equal(
        seat,
        new SequenceBounds(10).coerce({ kind: "sequence", value: [1, 2, 3, 4, 5] }),
        [1, 2, 3, 4, 5],
        "no cut",
      );
    });

    it("returns the target for another kind", ({ seat }) => {
      check.equal(
        seat,
        new SequenceBounds(10, 1).coerce({ kind: "integer", value: 5n }),
        [0],
        "the target",
      );
    });
  });

  describe("sameChoice", () => {
    const tests: { name: string; give: [Choice, Choice]; want: boolean }[] = [
      {
        name: "two NaN floats",
        give: [
          { kind: "float", value: Number.NaN },
          { kind: "float", value: -Number.NaN },
        ],
        want: true,
      },
      {
        name: "the two zeros",
        give: [
          { kind: "float", value: 0 },
          { kind: "float", value: -0 },
        ],
        want: false,
      },
      {
        name: "two equal sequences",
        give: [
          { kind: "sequence", value: [1, 2] },
          { kind: "sequence", value: [1, 2] },
        ],
        want: true,
      },
      {
        name: "sequences of two lengths",
        give: [
          { kind: "sequence", value: [1] },
          { kind: "sequence", value: [1, 2] },
        ],
        want: false,
      },
      {
        name: "sequences with another element",
        give: [
          { kind: "sequence", value: [1, 3] },
          { kind: "sequence", value: [1, 2] },
        ],
        want: false,
      },
      {
        name: "two equal integers",
        give: [
          { kind: "integer", value: 5n },
          { kind: "integer", value: 5n },
        ],
        want: true,
      },
      {
        name: "two kinds",
        give: [
          { kind: "integer", value: 1n },
          { kind: "float", value: 1 },
        ],
        want: false,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want} for ${tt.name}`, ({ seat }) => {
        check.equal(seat, sameChoice(...tt.give), tt.want, "the verdict");
      });
    }
  });
});
