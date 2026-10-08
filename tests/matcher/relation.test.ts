/**
 * The spec of the relations. It uses vitest's `expect` alone, because the
 * surfaces call these assertions.
 */

import { describe, expect, it } from "vitest";
import { byIdentity, equateEmpty, equateNans } from "../../src/matcher/option.js";
import * as relation from "../../src/matcher/relation.js";
import { Mode } from "../../src/matcher/seat.js";
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
  return () => values[Math.min(next++, values.length - 1)] as T;
}

/** Returns a function that throws boom on its nth call, from 1, and returns otherwise. */
function throwsOnCall(nth: number, boom: unknown): () => void {
  let calls = 0;
  return () => {
    calls += 1;
    if (calls === nth) throw boom;
  };
}

const boom = new Error("boom");

describe("relation", () => {
  describe("isIdempotent", () => {
    it("passes a call that sets the state to its input", async () => {
      let cell = 0;
      const seat = await drive((s) =>
        relation.isIdempotent(
          s,
          Mode.Fatal,
          (x: number) => {
            cell = x;
          },
          7,
          () => cell,
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports both readings of a call that appends its input", async () => {
      const state: number[] = [];
      const seat = await drive((s) =>
        relation.isIdempotent(
          s,
          Mode.Fatal,
          (x: number) => state.push(x),
          1,
          () => [...state],
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["idempotent", { first: [1], second: [1, 1] }]]);
    });

    it("reports an absent reading against an empty one", async () => {
      const seat = await drive((s) =>
        relation.isIdempotent(s, Mode.Fatal, () => undefined, 0, script(null, []), MSG),
      );

      expect(reported(seat)).toEqual([["idempotent", { first: null, second: [] }]]);
    });

    it("passes an absent reading against an empty one under equateEmpty", async () => {
      const seat = await drive((s) =>
        relation.isIdempotent(
          s,
          Mode.Fatal,
          () => undefined,
          0,
          script(null, []),
          MSG,
          equateEmpty(),
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a throw of the first call as first", async () => {
      const seat = await drive((s) =>
        relation.isIdempotent(s, Mode.Fatal, throwsOnCall(1, boom), 0, () => 0, MSG),
      );

      expect(reported(seat)).toEqual([["idempotent", { first: boom, second: null }]]);
    });

    it("reports a rejection of the second call as second", async () => {
      let calls = 0;
      const seat = await drive((s) =>
        relation.isIdempotent(
          s,
          Mode.Fatal,
          async () => {
            calls += 1;
            if (calls === 2) throw boom;
          },
          0,
          () => 0,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["idempotent", { first: null, second: boom }]]);
    });

    it("reports the call site that it read before its first await", async () => {
      const state: number[] = [];
      const seat = await drive((s) =>
        relation.isIdempotent(
          s,
          Mode.Fatal,
          (x: number) => state.push(x),
          1,
          () => [...state],
          MSG,
        ),
      );

      expect(seat.failures[0]?.where?.file).toMatch(/relation\.test\.ts$/);
    });
  });

  describe("accumulates", () => {
    it("passes a count that each call raises by one", async () => {
      let count = 0;
      const seat = await drive((s) =>
        relation.accumulates(
          s,
          Mode.Fatal,
          () => {
            count += 1;
          },
          0,
          () => count,
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("passes a count that each call lowers by the same amount", async () => {
      const seat = await drive((s) =>
        relation.accumulates(s, Mode.Fatal, () => undefined, 0, script(10, 7, 4), MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("passes a bigint count that each call raises by one", async () => {
      const seat = await drive((s) =>
        relation.accumulates(
          s,
          Mode.Fatal,
          () => undefined,
          0,
          script(0n, 1n, 2n),
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports both changes of a first call that changes nothing", async () => {
      const seat = await drive((s) =>
        relation.accumulates(
          s,
          Mode.Fatal,
          () => undefined,
          0,
          () => 5,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["accumulates", { first: 0, second: 0 }]]);
    });

    it("reports both changes of a call that sets a value", async () => {
      let cell = 0;
      const seat = await drive((s) =>
        relation.accumulates(
          s,
          Mode.Fatal,
          (x: number) => {
            cell = x;
          },
          7,
          () => cell,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["accumulates", { first: 7, second: 0 }]]);
    });

    it("reports both changes of calls that change the count by different amounts", async () => {
      const seat = await drive((s) =>
        relation.accumulates(s, Mode.Fatal, () => undefined, 0, script(0, 1, 3), MSG),
      );

      expect(reported(seat)).toEqual([["accumulates", { first: 1, second: 2 }]]);
    });

    it("reports a throw of the reading before the first call as first", async () => {
      const seat = await drive((s) =>
        relation.accumulates(
          s,
          Mode.Fatal,
          () => undefined,
          0,
          () => {
            throw boom;
          },
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["accumulates", { first: boom, second: null }]]);
    });

    it("reports a throw of the second call as second", async () => {
      let count = 0;
      const rise = throwsOnCall(2, boom);
      const seat = await drive((s) =>
        relation.accumulates(
          s,
          Mode.Fatal,
          () => {
            rise();
            count += 1;
          },
          0,
          () => count,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["accumulates", { first: null, second: boom }]]);
    });

    it("reports the TypeError of a bigint reading after a number", async () => {
      const seat = await drive((s) =>
        relation.accumulates(
          s,
          Mode.Fatal,
          () => undefined,
          0,
          script<relation.Count>(0, 1n),
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([
        ["accumulates", { first: expect.any(TypeError), second: null }],
      ]);
    });
  });

  describe("isDeterministic", () => {
    it("passes a call that returns its input", async () => {
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, (x: number) => x, 1, MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the first two results of a call that counts its calls", async () => {
      let calls = 0;
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, () => ++calls, 1, MSG),
      );

      expect(reported(seat)).toEqual([["deterministic", { first: 1, second: 2 }]]);
    });

    it("reports a result that changes at the 32nd call", async () => {
      const results = [...Array<number>(31).fill(0), 1];
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, script(...results), 1, MSG),
      );

      expect(reported(seat)).toEqual([["deterministic", { first: 0, second: 1 }]]);
    });

    it("passes a result that changes at the 33rd call", async () => {
      const results = [...Array<number>(32).fill(0), 1];
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, script(...results), 1, MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports NaN results", async () => {
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, () => Number.NaN, 1, MSG),
      );

      expect(reported(seat)).toEqual([
        ["deterministic", { first: Number.NaN, second: Number.NaN }],
      ]);
    });

    it("passes NaN results under equateNans", async () => {
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, () => Number.NaN, 1, MSG, equateNans()),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a throw of the first call as first", async () => {
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, throwsOnCall(1, boom), 1, MSG),
      );

      expect(reported(seat)).toEqual([
        ["deterministic", { first: boom, second: null }],
      ]);
    });

    it("reports a throw of a later call as second", async () => {
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, throwsOnCall(5, boom), 1, MSG),
      );

      expect(reported(seat)).toEqual([
        ["deterministic", { first: null, second: boom }],
      ]);
    });
  });

  describe("isCommutative", () => {
    const subtract = (a: number, b: number) => a - b;

    it("passes addition", async () => {
      const seat = await drive((s) =>
        relation.isCommutative(
          s,
          Mode.Fatal,
          (a: number, b: number) => a + b,
          2,
          3,
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports both orders of subtraction", async () => {
      const seat = await drive((s) =>
        relation.isCommutative(s, Mode.Fatal, subtract, 2, 3, MSG),
      );

      expect(reported(seat)).toEqual([["commutative", { first: -1, second: 1 }]]);
    });

    it("passes a NaN result under equateNans", async () => {
      const seat = await drive((s) =>
        relation.isCommutative(
          s,
          Mode.Fatal,
          () => Number.NaN,
          2,
          3,
          MSG,
          equateNans(),
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a throw of the first order as first", async () => {
      const seat = await drive((s) =>
        relation.isCommutative(s, Mode.Fatal, throwsOnCall(1, boom), 2, 3, MSG),
      );

      expect(reported(seat)).toEqual([["commutative", { first: boom, second: null }]]);
    });

    it("reports a throw of the second order as second", async () => {
      const seat = await drive((s) =>
        relation.isCommutative(s, Mode.Fatal, throwsOnCall(2, boom), 2, 3, MSG),
      );

      expect(reported(seat)).toEqual([["commutative", { first: null, second: boom }]]);
    });
  });

  describe("isAssociative", () => {
    it("passes addition", async () => {
      const seat = await drive((s) =>
        relation.isAssociative(
          s,
          Mode.Fatal,
          (a: number, b: number) => a + b,
          2,
          3,
          5,
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports both groupings of subtraction", async () => {
      const seat = await drive((s) =>
        relation.isAssociative(
          s,
          Mode.Fatal,
          (a: number, b: number) => a - b,
          2,
          3,
          5,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["associative", { first: -6, second: 4 }]]);
    });

    it("awaits a combination that returns a promise", async () => {
      const seat = await drive((s) =>
        relation.isAssociative(
          s,
          Mode.Fatal,
          async (a: number, b: number) => a + b,
          2,
          3,
          5,
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a throw in the left grouping as first", async () => {
      const seat = await drive((s) =>
        relation.isAssociative(
          s,
          Mode.Fatal,
          () => {
            throw boom;
          },
          2,
          3,
          5,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["associative", { first: boom, second: null }]]);
    });

    it("reports a throw in the right grouping as second", async () => {
      const combine = throwsOnCall(3, boom);
      const seat = await drive((s) =>
        relation.isAssociative(
          s,
          Mode.Fatal,
          (a: number, b: number) => {
            combine();
            return a + b;
          },
          2,
          3,
          5,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["associative", { first: null, second: boom }]]);
    });
  });

  describe("roundTrip", () => {
    const parse = (text: string) => Number(text);

    it("passes a decimal rendering", async () => {
      const seat = await drive((s) =>
        relation.roundTrip(s, Mode.Fatal, (x: number) => String(x), parse, -42, MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the input with what came back from a rendering that drops the sign", async () => {
      const seat = await drive((s) =>
        relation.roundTrip(
          s,
          Mode.Fatal,
          (x: number) => String(Math.abs(x)),
          parse,
          -42,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["round-trip", { want: -42, got: 42 }]]);
    });

    it("passes a NaN under equateNans", async () => {
      const seat = await drive((s) =>
        relation.roundTrip(
          s,
          Mode.Fatal,
          (x: number) => String(x),
          parse,
          Number.NaN,
          MSG,
          equateNans(),
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a throw of forward as got", async () => {
      const seat = await drive((s) =>
        relation.roundTrip(
          s,
          Mode.Fatal,
          (): string => {
            throw boom;
          },
          parse,
          1,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["round-trip", { want: null, got: boom }]]);
    });

    it("reports a rejection of inverse as got", async () => {
      const seat = await drive((s) =>
        relation.roundTrip(
          s,
          Mode.Fatal,
          (x: number) => String(x),
          async (): Promise<number> => {
            throw boom;
          },
          1,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["round-trip", { want: null, got: boom }]]);
    });
  });

  describe("hasStableOrder", () => {
    it("passes a fixed order", async () => {
      const seat = await drive((s) =>
        relation.hasStableOrder(s, Mode.Fatal, () => [1, 2, 3], MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the first two orders of a rotating order", async () => {
      let items = [1, 2, 3];
      const seat = await drive((s) =>
        relation.hasStableOrder(
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
        relation.hasStableOrder(
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
        relation.hasStableOrder(s, Mode.Fatal, async () => new Set([1, 2]), MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports an absent sequence against an empty one", async () => {
      const seat = await drive((s) =>
        relation.hasStableOrder(
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
        relation.hasStableOrder(
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
        relation.hasStableOrder(
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
    const one = Object(1);

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
        give: () => [Object(1), Object(1)],
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
        give: async function* () {
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
          relation.noDuplicates(
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

  describe("isMonotonic", () => {
    const tests: {
      name: string;
      give: number[];
      giveSteps: number;
      want?: Record<string, unknown>;
    }[] = [
      { name: "passes a rising reading", give: [0, 1, 2, 3, 4, 5], giveSteps: 5 },
      { name: "passes a reading that does not change", give: [3, 3, 3], giveSteps: 2 },
      {
        name: "reports where a reading that wraps around fell",
        give: [0, 1, 2, 3, 0, 1],
        giveSteps: 5,
        want: { index: 4, first: 3, second: 0 },
      },
      {
        name: "reports a fall at the last step",
        give: [0, 1, 0],
        giveSteps: 2,
        want: { index: 2, first: 1, second: 0 },
      },
      { name: "passes one reading for no steps", give: [5, 0], giveSteps: 0 },
      {
        name: "reports a NaN first reading at position 0",
        give: [Number.NaN],
        giveSteps: 3,
        want: { index: 0, first: null, second: Number.NaN },
      },
      {
        name: "reports a NaN later reading",
        give: [0, Number.NaN],
        giveSteps: 3,
        want: { index: 1, first: 0, second: Number.NaN },
      },
    ];

    for (const tt of tests) {
      it(tt.name, async () => {
        const seat = await drive((s) =>
          relation.isMonotonic(
            s,
            Mode.Fatal,
            script(...tt.give),
            () => undefined,
            tt.giveSteps,
            MSG,
          ),
        );

        expect(reported(seat)).toEqual(
          tt.want === undefined ? [] : [["monotonic", tt.want]],
        );
      });
    }

    it("reports a throw of advance as second", async () => {
      const seat = await drive((s) =>
        relation.isMonotonic(
          s,
          Mode.Fatal,
          () => 0,
          () => {
            throw boom;
          },
          3,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([
        ["monotonic", { index: null, first: null, second: boom }],
      ]);
    });

    it("reports a throw of the first reading as second", async () => {
      const seat = await drive((s) =>
        relation.isMonotonic(
          s,
          Mode.Fatal,
          () => {
            throw boom;
          },
          () => undefined,
          3,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([
        ["monotonic", { index: null, first: null, second: boom }],
      ]);
    });
  });

  describe("isTotal", () => {
    it("passes a call that succeeds for every element", async () => {
      const seat = await drive((s) =>
        relation.isTotal(s, Mode.Fatal, () => undefined, [1, 2, 3], MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("passes an empty domain", async () => {
      const seat = await drive((s) =>
        relation.isTotal(
          s,
          Mode.Fatal,
          () => {
            throw boom;
          },
          [],
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the index with the error of a later element", async () => {
      const seat = await drive((s) =>
        relation.isTotal(
          s,
          Mode.Fatal,
          async (x: number) => {
            if (x === 3) throw boom;
          },
          new Set([1, 2, 3]),
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["total", { index: 2, got: boom }]]);
    });
  });

  describe("isNotPure", () => {
    it("passes a changed projection", async () => {
      let count = 0;
      const seat = await drive((s) =>
        relation.isNotPure(
          s,
          Mode.Fatal,
          () => count,
          () => {
            count += 1;
          },
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a projection that did not change", async () => {
      const seat = await drive((s) =>
        relation.isNotPure(
          s,
          Mode.Fatal,
          () => 0,
          () => undefined,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["not-pure", { got: 0 }]]);
    });

    it("passes a change from absent to empty", async () => {
      const seat = await drive((s) =>
        relation.isNotPure(s, Mode.Fatal, script(null, []), () => undefined, MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a change from absent to empty under equateEmpty", async () => {
      const seat = await drive((s) =>
        relation.isNotPure(
          s,
          Mode.Fatal,
          script(null, []),
          () => undefined,
          MSG,
          equateEmpty(),
        ),
      );

      expect(reported(seat)).toEqual([["not-pure", { got: [] }]]);
    });

    it("reports a throw of fn as got", async () => {
      const seat = await drive((s) =>
        relation.isNotPure(
          s,
          Mode.Fatal,
          () => 0,
          () => {
            throw boom;
          },
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["not-pure", { got: boom }]]);
    });
  });

  describe("failsAfterClose", () => {
    class Closed extends Error {}
    const sentinel = new Closed("closed");

    const tests: {
      name: string;
      giveClose: () => unknown;
      giveCall: () => unknown;
      giveSentinel: unknown;
      want?: Record<string, unknown>;
    }[] = [
      {
        name: "passes a call that throws the sentinel",
        giveClose: () => undefined,
        giveCall: () => {
          throw sentinel;
        },
        giveSentinel: sentinel,
      },
      {
        name: "passes a call that rejects with an error that wraps the sentinel",
        giveClose: () => undefined,
        giveCall: async () => {
          throw new Error("while reading", { cause: sentinel });
        },
        giveSentinel: sentinel,
      },
      {
        name: "passes a call that throws an error of the sentinel class",
        giveClose: () => undefined,
        giveCall: () => {
          throw new Closed("another");
        },
        giveSentinel: Closed,
      },
      {
        name: "reports a call that returns with got null",
        giveClose: () => undefined,
        giveCall: () => 1,
        giveSentinel: sentinel,
        want: { want: sentinel, got: null },
      },
      {
        name: "reports a call that fails with another error",
        giveClose: () => undefined,
        giveCall: () => {
          throw boom;
        },
        giveSentinel: sentinel,
        want: { want: sentinel, got: boom },
      },
      {
        name: "reports a throw of close as got with want null",
        giveClose: () => {
          throw boom;
        },
        giveCall: () => undefined,
        giveSentinel: sentinel,
        want: { want: null, got: boom },
      },
    ];

    for (const tt of tests) {
      it(tt.name, async () => {
        const seat = await drive((s) =>
          relation.failsAfterClose(
            s,
            Mode.Fatal,
            tt.giveClose,
            tt.giveCall,
            tt.giveSentinel,
            MSG,
          ),
        );

        expect(reported(seat)).toEqual(
          tt.want === undefined ? [] : [["after-close", tt.want]],
        );
      });
    }
  });

  describe("isPoisoned", () => {
    it("passes a subject whose 32 readings after induce all throw", async () => {
      let readings = 0;
      const seat = await drive((s) =>
        relation.isPoisoned(
          s,
          Mode.Fatal,
          () => undefined,
          () => {
            readings += 1;
            if (readings <= 32) throw boom;
          },
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the first reading that returns with what it returned", async () => {
      let readings = 0;
      const seat = await drive((s) =>
        relation.isPoisoned(
          s,
          Mode.Fatal,
          () => undefined,
          async () => {
            readings += 1;
            if (readings < 3) throw boom;
            return "served";
          },
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["poisoned", { index: 2, got: "served" }]]);
    });

    it("reports a throw of induce as got with index null", async () => {
      const seat = await drive((s) =>
        relation.isPoisoned(
          s,
          Mode.Fatal,
          () => {
            throw boom;
          },
          () => undefined,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["poisoned", { index: null, got: boom }]]);
    });
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
        relation.isPermutation(
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
