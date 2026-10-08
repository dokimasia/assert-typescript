/**
 * The spec of the draws: what each consumes from the stream, and what it
 * returns. The pinned draws are the draws of the definition's reference
 * implementation.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  FloatBounds,
  INT64_MAX,
  INT64_MIN,
  IntegerBounds,
  SequenceBounds,
  UINT64_MAX,
} from "../../../src/prop/engine/choice.js";
import {
  averageLength,
  boolean,
  flag,
  flagBounds,
  floatEdges,
  floatValue,
  integer,
  integerEdges,
  keep,
  REUSE_ODDS,
  sequence,
  weighted,
} from "../../../src/prop/engine/draw.js";
import {
  fromBits32,
  representable,
  sameFloat,
} from "../../../src/prop/engine/float.js";
import { Source } from "../../../src/prop/engine/source.js";
import { test as it } from "../../../src/vitest.js";

/** The draws of a check of a property of a draw: enough to visit every branch of the draw. */
const DRAWS = 2000;

/** The probability of one half. */
const HALF = { num: 1n, den: 2n };

/** Returns the values of fn at the indices from 0 to count − 1. */
function times<T>(count: number, fn: (_: unknown, index: number) => T): T[] {
  return Array.from({ length: count }, fn);
}

describe("draw", () => {
  describe("REUSE_ODDS", () => {
    it("reuses an earlier value one time in four", ({ seat }) => {
      check.equal(seat, REUSE_ODDS, 4n, "the odds");
    });
  });

  describe("integerEdges", () => {
    const tests: { name: string; give: readonly [bigint, bigint]; want: bigint[] }[] = [
      {
        name: "one neighbour of a target at the lower bound",
        give: [0n, 10n] as const,
        want: [0n, 10n, 1n],
      },
      {
        name: "both neighbours of a target between the bounds",
        give: [-5n, 5n] as const,
        want: [0n, -5n, 5n, 1n, -1n],
      },
      { name: "each value once", give: [1n, 2n] as const, want: [1n, 2n] },
      {
        name: "the one value of bounds of one value",
        give: [3n, 3n] as const,
        want: [3n],
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          integerEdges(new IntegerBounds(...tt.give)),
          tt.want,
          "the edges",
        );
      });
    }
  });

  describe("integer", () => {
    it("returns the value of equal bounds without consuming the stream", ({ seat }) => {
      const source = new Source(1n);
      const twin = new Source(1n);

      check.equal(
        seat,
        [integer(source, new IntegerBounds(7n, 7n)), source.next()],
        [7n, twin.next()],
        "the stream is untouched",
      );
    });

    it("returns a value inside the bounds for every draw", ({ seat }) => {
      const all = [
        [-100n, 100n],
        [0n, 1n],
        [5n, 9n],
        [-9n, -5n],
        [INT64_MIN, INT64_MAX],
        [0n, UINT64_MAX],
      ] as const;
      const outside = all.flatMap(([lo, hi]) => {
        const bounds = new IntegerBounds(lo, hi);
        const source = new Source(lo & UINT64_MAX);
        return times(DRAWS, () => integer(source, bounds)).filter(
          (value) => !bounds.admits(value),
        );
      });

      check.isEmpty(seat, outside, "no value outside its bounds");
    });

    it("draws an edge or a capped offset for a target at the lower bound", ({
      seat,
    }) => {
      const bounds = new IntegerBounds(0n, 1000n);
      const got = times(50, (_, seed) => {
        const source = new Source(BigInt(seed));
        return [integer(source, bounds), source.next()];
      });
      const want = times(50, (_, seed) => {
        const twin = new Source(BigInt(seed));
        let value: bigint;
        if (twin.coin(1n, 8n)) {
          const edges = integerEdges(bounds);
          value = edges[Number(twin.below(BigInt(edges.length)))] as bigint;
        } else {
          const cap = [1n << 4n, 1n << 8n, 1n << 16n, 1n << 64n][
            Number(twin.below(4n))
          ] as bigint;
          value = twin.below((cap - 1n < 1000n ? cap - 1n : 1000n) + 1n);
        }
        return [value, twin.next()];
      });

      check.equal(seat, got, want, "the draws and the stream after them for 50 seeds");
    });

    it("returns the pinned draws of seed 42", ({ seat }) => {
      const source = new Source(42n);
      const bounds = new IntegerBounds(-100n, 100n);

      check.equal(
        seat,
        times(10, () => integer(source, bounds)),
        [11n, 24n, 14n, 62n, -71n, -5n, 8n, -21n, -29n, -69n],
        "ten draws",
      );
    });

    it("returns the pinned draws of seed 42 over the whole signed range", ({
      seat,
    }) => {
      const source = new Source(42n);
      const bounds = new IntegerBounds(INT64_MIN, INT64_MAX);

      check.equal(
        seat,
        times(10, () => integer(source, bounds)),
        [
          11n,
          49n,
          14n,
          31_993n,
          -207n,
          -49_792n,
          -10n,
          INT64_MIN,
          3_534_659_902_462_096_457n,
          51_818n,
        ],
        "ten draws",
      );
    });

    it("moves down from a target at the upper bound", ({ seat }) => {
      const bounds = new IntegerBounds(-1000n, -1n);
      const source = new Source(5n);

      check.isTrue(
        seat,
        times(DRAWS, () => integer(source, bounds)).every(
          (value) => value <= -1n && value >= -1000n,
        ),
        "every value is at or below -1",
      );
    });
  });

  describe("boolean", () => {
    it("returns the certain outcome of a probability of 0 or 1", ({ seat }) => {
      const source = new Source(2n);

      check.equal(
        seat,
        times(100, () => [
          boolean(source, { num: 0n, den: 1n }),
          boolean(source, { num: 1n, den: 1n }),
        ]),
        times(100, () => [0n, 1n]),
        "certain draws",
      );
    });

    it("returns 1 exactly when the coin comes up", ({ seat }) => {
      const source = new Source(3n);
      const twin = new Source(3n);

      check.equal(
        seat,
        times(100, () => boolean(source, { num: 1n, den: 3n })),
        times(100, () => (twin.coin(1n, 3n) ? 1n : 0n)),
        "one coin per draw",
      );
    });
  });

  describe("weighted", () => {
    it("returns 0 for one weight without consuming the stream", ({ seat }) => {
      const source = new Source(4n);
      const twin = new Source(4n);

      check.equal(
        seat,
        [weighted(source, [3n]), source.next()],
        [0, twin.next()],
        "the stream is untouched",
      );
    });

    it("returns the first index whose running sum of weights exceeds the draw", ({
      seat,
    }) => {
      const source = new Source(6n);
      const twin = new Source(6n);

      check.equal(
        seat,
        times(DRAWS, () => weighted(source, [1n, 2n, 1n])),
        times(DRAWS, () => [0, 1, 1, 2][Number(twin.below(4n))] as number),
        "weights 1, 2 and 1 split below(4) into [0], [1, 2] and [3]",
      );
    });
  });

  describe("keep", () => {
    it("tosses one coin after a kept action", ({ seat }) => {
      const source = new Source(8n);
      const twin = new Source(8n);

      check.equal(
        seat,
        [1, 3].flatMap((remaining) =>
          times(50, () => keep(source, HALF, true, remaining)),
        ),
        [1, 3].flatMap(() => times(50, () => boolean(twin, HALF))),
        "the coin of the probability",
      );
    });

    it("keeps the last action without a draw when no action is kept", ({ seat }) => {
      const source = new Source(8n);
      const twin = new Source(8n);

      check.equal(
        seat,
        [keep(source, HALF, false, 1), source.next()],
        [1n, twin.next()],
        "the stream is untouched",
      );
    });

    it("tosses a coin per remaining action until one comes up before any action is kept", ({
      seat,
    }) => {
      const got = times(100, (_, seed) => {
        const source = new Source(BigInt(seed));
        return [keep(source, HALF, false, 3), source.next()];
      });
      const want = times(100, (_, seed) => {
        const twin = new Source(BigInt(seed));
        let coins = times(3, () => boolean(twin, HALF));
        while (!coins.includes(1n)) coins = times(3, () => boolean(twin, HALF));
        return [coins[0] as bigint, twin.next()];
      });

      check.equal(
        seat,
        got,
        want,
        "the first coin of the first round with a coin up, for 100 seeds",
      );
    });

    it("keeps each nonempty set of two actions about a third of the time", ({
      seat,
    }) => {
      const source = new Source(10n);
      const counts = new Map<string, number>();
      for (let i = 0; i < DRAWS * 3; i += 1) {
        const first = keep(source, HALF, false, 2);
        const second = keep(source, HALF, first === 1n, 1);
        counts.set(`${first}${second}`, (counts.get(`${first}${second}`) ?? 0) + 1);
      }

      check.isTrue(
        seat,
        ["10", "01", "11"].every(
          (kept) => Math.abs((counts.get(kept) ?? 0) / (DRAWS * 3) - 1 / 3) <= 0.03,
        ),
        "each share is within 0.03 of a third",
      );
    });
  });

  describe("averageLength", () => {
    const tests: {
      name: string;
      give: readonly [number, number | undefined];
      want: number;
    }[] = [
      { name: "5 without a maximum", give: [0, undefined] as const, want: 5 },
      { name: "5 for a maximum of 16", give: [0, 16] as const, want: 5 },
      { name: "2 for a maximum of 3", give: [0, 3] as const, want: 2 },
      { name: "1 for a maximum of 1", give: [0, 1] as const, want: 1 },
      { name: "3 for sizes from 2 to 4", give: [2, 4] as const, want: 3 },
      { name: "3 for sizes of 3 alone", give: [3, 3] as const, want: 3 },
      {
        name: "20 for a minimum of 10 without a maximum",
        give: [10, undefined] as const,
        want: 20,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, averageLength(...tt.give), tt.want, "the average");
      });
    }
  });

  describe("flagBounds", () => {
    const tests: {
      name: string;
      give: readonly [number, number, number | undefined];
      want: string;
    }[] = [
      {
        name: "[1, 1] below the minimum",
        give: [1, 2, 9] as const,
        want: "integer 1 1",
      },
      { name: "[0, 0] at the maximum", give: [9, 2, 9] as const, want: "integer 0 0" },
      {
        name: "[0, 1] without a maximum",
        give: [3, 0, undefined] as const,
        want: "integer 0 1",
      },
      {
        name: "[0, 1] between the sizes",
        give: [2, 2, 3] as const,
        want: "integer 0 1",
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, flagBounds(...tt.give).id, tt.want, "the bounds");
      });
    }
  });

  describe("flag", () => {
    it("continues below the minimum without consuming the stream", ({ seat }) => {
      const source = new Source(5n);
      const twin = new Source(5n);

      check.equal(
        seat,
        [flag(source, 1, 2, 9, 7), source.next()],
        [1n, twin.next()],
        "a forced continue",
      );
    });

    it("stops at the maximum without consuming the stream", ({ seat }) => {
      const source = new Source(5n);
      const twin = new Source(5n);

      check.equal(
        seat,
        [flag(source, 9, 2, 9, 7), source.next()],
        [0n, twin.next()],
        "a forced stop",
      );
    });

    it("continues by a coin of the average's extra length in one more", ({ seat }) => {
      const source = new Source(5n);
      const twin = new Source(5n);

      check.equal(
        seat,
        times(100, () => flag(source, 3, 0, undefined, 5)),
        times(100, () => (twin.coin(5n, 6n) ? 1n : 0n)),
        "a coin of 5 in 6",
      );
    });
  });

  describe("sequence", () => {
    it("draws as a list of integers with the same sizes draws", ({ seat }) => {
      const bounds = new SequenceBounds(256, 0, 16);
      const element = new IntegerBounds(0n, 255n);
      const got = times(100, (_, seed) => sequence(new Source(BigInt(seed)), bounds));
      const want = times(100, (_, seed) => {
        const twin = new Source(BigInt(seed));
        const elements: number[] = [];
        while (flag(twin, elements.length, 0, 16, averageLength(0, 16)) === 1n)
          elements.push(Number(integer(twin, element)));
        return elements;
      });

      check.equal(seat, got, want, "100 seeds");
    });

    it("returns a sequence that the bounds admit for every draw", ({ seat }) => {
      const bounds = new SequenceBounds(3, 2, 6);
      const source = new Source(11n);

      check.isTrue(
        seat,
        times(DRAWS, () => sequence(source, bounds)).every((value) =>
          bounds.admits(value),
        ),
        "every sequence fits",
      );
    });
  });

  describe("floatEdges", () => {
    it("returns six edges of bounds that allow NaN", ({ seat }) => {
      const edges = floatEdges(new FloatBounds(-1, 1, true));
      const want = [0, -1, 1, Number.MIN_VALUE, -Number.MIN_VALUE, Number.NaN];

      check.isTrue(
        seat,
        edges.length === want.length &&
          edges.every((v, i) => sameFloat(v, want[i] as number)),
        "six edges",
      );
    });

    it("returns each edge once", ({ seat }) => {
      check.equal(seat, floatEdges(new FloatBounds(2, 2)), [2], "one edge");
    });
  });

  describe("floatValue", () => {
    const all = [
      new FloatBounds(-1, 1),
      new FloatBounds(0.5, 0.75),
      new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
      new FloatBounds(1e300, Number.POSITIVE_INFINITY),
      new FloatBounds(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
      new FloatBounds(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY),
      new FloatBounds(-10, 10, false, 32),
      new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true),
      new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true, 32),
      new FloatBounds(fromBits32(1n), fromBits32(2n), false, 32),
    ];
    for (const bounds of all) {
      it(`returns values that bounds ${bounds.id} admit`, ({ seat }) => {
        const source = new Source(17n);
        const outside = times(DRAWS, () => floatValue(source, bounds)).filter(
          (value) => !bounds.admits(value) || !representable(value, bounds.width),
        );

        check.isEmpty(seat, outside, "no value outside the bounds");
      });
    }

    it("returns NaN for some draws of bounds that allow it", ({ seat }) => {
      const source = new Source(23n);
      const bounds = new FloatBounds(
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        true,
      );

      check.isTrue(
        seat,
        times(DRAWS, () => floatValue(source, bounds)).some(Number.isNaN),
        "a NaN among the draws",
      );
    });

    it("returns no NaN for bounds that refuse it", ({ seat }) => {
      const source = new Source(23n);
      const bounds = new FloatBounds(
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
      );

      check.isFalse(
        seat,
        times(DRAWS, () => floatValue(source, bounds)).some(Number.isNaN),
        "no NaN among the draws",
      );
    });
  });
});
