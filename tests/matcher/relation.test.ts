// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the relations. It uses vitest's `expect` alone, because the
 * surfaces call these assertions.
 */

import { describe, expect, it } from "vitest";
import { equateEmpty, equateNans } from "../../src/matcher/option.js";
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
            if (calls === 2) {
              throw boom;
            }
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
        relation.isDeterministic(
          s,
          Mode.Fatal,
          () => {
            calls += 1;
            return calls;
          },
          1,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["deterministic", { first: 1, second: 2 }]]);
    });

    it("reports a result that changes at the 32nd call", async () => {
      const results = [...new Array<number>(31).fill(0), 1];
      const seat = await drive((s) =>
        relation.isDeterministic(s, Mode.Fatal, script(...results), 1, MSG),
      );

      expect(reported(seat)).toEqual([["deterministic", { first: 0, second: 1 }]]);
    });

    it("passes a result that changes at the 33rd call", async () => {
      const results = [...new Array<number>(32).fill(0), 1];
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
});
