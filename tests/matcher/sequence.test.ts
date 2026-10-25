// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the relations of sequences. It uses vitest's `expect` alone,
 * because the surfaces call these assertions.
 */

import { describe, expect, it } from "vitest";
import { byIdentity, equateEmpty, equateNans } from "../../src/matcher/option.js";
import { Mode } from "../../src/matcher/seat.js";
import * as sequence from "../../src/matcher/sequence.js";
import { Recorder } from "../../src/seat.js";

/** The contract that every call passes. */
const MSG = "the stated contract";

/** Runs one call of a relation on a fresh recorder, and returns the recorder. */
async function drive(call: (seat: Recorder) => unknown): Promise<Recorder> {
  const seat = new Recorder();
  await call(seat);
  return seat;
}

/** Returns the assertion and the detail of each failure that seat received. */
function reported(seat: Recorder): [string, unknown][] {
  return seat.failures.map((f) => [f.assertion, f.detail]);
}

/** Returns a function that returns each of values in turn, and the last one after. */
function script<T>(...values: T[]): () => T {
  let next = 0;
  return () => {
    const value = values[Math.min(next, values.length - 1)] as T;
    next += 1;
    return value;
  };
}

/** Returns a function that throws thrown on its nth call, from 1, and returns otherwise. */
function throwsOnCall(nth: number, thrown: unknown): () => void {
  let calls = 0;
  return () => {
    calls += 1;
    if (calls === nth) {
      throw thrown;
    }
  };
}

const boom = new Error("boom");

describe("sequence", () => {
  describe("hasStableOrder", () => {
    it("passes a fixed order", async () => {
      const seat = await drive((s) =>
        sequence.hasStableOrder(s, Mode.Fatal, () => [1, 2, 3], MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the first two orders of a rotating order", async () => {
      let items = [1, 2, 3];
      const seat = await drive((s) =>
        sequence.hasStableOrder(
          s,
          Mode.Fatal,
          () => {
            const out = items;
            items = [...items.slice(1), ...items.slice(0, 1)];
            return out;
          },
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([
        ["stable-order", { first: [1, 2, 3], second: [2, 3, 1] }],
      ]);
    });

    it("reads an async iterable", async () => {
      const seat = await drive((s) =>
        sequence.hasStableOrder(
          s,
          Mode.Fatal,
          async function* () {
            yield 1;
            yield 2;
          },
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reads a promise of an iterable", async () => {
      const seat = await drive((s) =>
        sequence.hasStableOrder(s, Mode.Fatal, async () => new Set([1, 2]), MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports an absent sequence against an empty one", async () => {
      const seat = await drive((s) =>
        sequence.hasStableOrder(
          s,
          Mode.Fatal,
          script<number[] | null>(null, []) as () => number[],
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["stable-order", { first: null, second: [] }]]);
    });

    it("passes an absent sequence against an empty one under equateEmpty", async () => {
      const seat = await drive((s) =>
        sequence.hasStableOrder(
          s,
          Mode.Fatal,
          script<number[] | null>(null, []) as () => number[],
          MSG,
          equateEmpty(),
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a throw of a later iteration as second", async () => {
      const once = throwsOnCall(2, boom);
      const seat = await drive((s) =>
        sequence.hasStableOrder(
          s,
          Mode.Fatal,
          () => {
            once();
            return [1];
          },
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["stable-order", { first: null, second: boom }]]);
    });
  });

  describe("noDuplicates", () => {
    const one = new Object(1);

    const tests: {
      name: string;
      give: () => unknown;
      giveIdentity?: boolean;
      giveNans?: boolean;
      want?: Record<string, unknown>;
    }[] = [
      { name: "passes distinct elements", give: () => [1, 2, 3] },
      { name: "passes no elements", give: () => [] },
      { name: "passes an absent sequence", give: () => null },
      {
        name: "reports a repeated element at its position",
        give: () => [1, 2, 2, 3],
        want: { got: 2, index: 2 },
      },
      {
        name: "reports a repeat of the first element where it repeats",
        give: () => [1, 2, 1],
        want: { got: 1, index: 2 },
      },
      { name: "passes two NaNs", give: () => [Number.NaN, Number.NaN] },
      {
        name: "reports two NaNs under equateNans",
        give: () => [Number.NaN, Number.NaN],
        giveNans: true,
        want: { got: Number.NaN, index: 1 },
      },
      {
        name: "passes two equal objects under byIdentity",
        give: () => [new Object(1), new Object(1)],
        giveIdentity: true,
      },
      {
        name: "reports one object twice under byIdentity",
        give: () => [one, one],
        giveIdentity: true,
        want: { got: one, index: 1 },
      },
      {
        name: "reports a repeat that an async iterable yields",
        async *give() {
          yield 1;
          yield 1;
        },
        want: { got: 1, index: 1 },
      },
      {
        name: "reports a throw of iterate as got",
        give: () => {
          throw boom;
        },
        want: { got: boom, index: null },
      },
    ];

    for (const tt of tests) {
      it(tt.name, async () => {
        const options = [
          ...(tt.giveIdentity ? [byIdentity()] : []),
          ...(tt.giveNans ? [equateNans()] : []),
        ];
        const seat = await drive((s) =>
          sequence.noDuplicates(
            s,
            Mode.Fatal,
            tt.give as () => number[],
            MSG,
            ...options,
          ),
        );

        expect(reported(seat)).toEqual(
          tt.want === undefined ? [] : [["no-duplicates", tt.want]],
        );
      });
    }
  });

  describe("isPermutation", () => {
    const a = { n: 1 };
    const b = { n: 2 };

    const tests: {
      name: string;
      giveGot: unknown;
      giveWant: unknown;
      giveOptions?: ReturnType<typeof equateEmpty>[];
      want: boolean;
    }[] = [
      {
        name: "passes the same elements in another order",
        giveGot: [3, 1, 2],
        giveWant: [1, 2, 3],
        want: true,
      },
      {
        name: "passes repeated elements in another order",
        giveGot: [1, 2, 1],
        giveWant: [1, 1, 2],
        want: true,
      },
      {
        name: "fails an element repeated a different number of times",
        giveGot: [1, 1, 2],
        giveWant: [1, 2, 2],
        want: false,
      },
      {
        name: "fails an extra element",
        giveGot: [1, 2, 3],
        giveWant: [1, 2],
        want: false,
      },
      {
        name: "fails two NaNs",
        giveGot: [Number.NaN],
        giveWant: [Number.NaN],
        want: false,
      },
      {
        name: "passes two NaNs under equateNans",
        giveGot: [Number.NaN],
        giveWant: [Number.NaN],
        giveOptions: [equateNans()],
        want: true,
      },
      {
        name: "fails an absent list against an empty one",
        giveGot: null,
        giveWant: [],
        want: false,
      },
      {
        name: "passes an absent list against an empty one under equateEmpty",
        giveGot: null,
        giveWant: [],
        giveOptions: [equateEmpty()],
        want: true,
      },
      { name: "passes two absent lists", giveGot: null, giveWant: null, want: true },
      {
        name: "passes the same objects in another order under byIdentity",
        giveGot: [a, b],
        giveWant: [b, a],
        giveOptions: [byIdentity()],
        want: true,
      },
      {
        name: "fails an equal object in place of one under byIdentity",
        giveGot: [{ n: 1 }, b],
        giveWant: [a, b],
        giveOptions: [byIdentity()],
        want: false,
      },
      {
        name: "passes elements that need a partner other than their first under equateEmpty",
        giveGot: [null, []],
        giveWant: [[], {}],
        giveOptions: [equateEmpty()],
        want: true,
      },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const seat = new Recorder();
        sequence.isPermutation(
          seat,
          Mode.Fatal,
          tt.giveGot,
          tt.giveWant,
          MSG,
          ...(tt.giveOptions ?? []),
        );

        expect(reported(seat)).toEqual(
          tt.want ? [] : [["permutation", { want: tt.giveWant, got: tt.giveGot }]],
        );
      });
    }
  });
});
