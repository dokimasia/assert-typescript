// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the matchers of the expect chain. It compares each matcher's
 * outcome with the failure that the function form reports for the same
 * call, so it states each chain call apart from the table that places the
 * subject. It uses vitest's `expect` alone, because the matchers deliver
 * the verdict to the runner.
 */

import { describe, expect, it } from "vitest";
import * as check from "../../src/check.js";
import { Controlled } from "../../src/clock.js";
import { Call } from "../../src/expect/guard.js";
import {
  matchers,
  NAMES,
  NEGATIVES,
  type Outcome,
  type Runner,
  type State,
  SUBJECTS,
} from "../../src/expect/matchers.js";
import type { Seat } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";
import { FAILING, ignores } from "../helpers.js";

/** The contract that every call passes. */
const MSG = "the stated contract";

/** The state of a call outside `.not`. */
const PLAIN: State = { isNot: false };

/** A matcher of the table, called with the state of a call outside `.not`. */
type Chained = (received: unknown, ...args: unknown[]) => Outcome | Promise<Outcome>;

/** The matchers, by the name of their assertion. */
type Table = { readonly [K in keyof typeof check]: Chained };

/** Returns the matchers of runner, each called outside `.not`. */
function chainOf(runner: Runner): Table {
  return Object.fromEntries(
    Object.entries(matchers(runner)).map(([name, matcher]) => [
      name,
      (received: unknown, ...args: unknown[]) => matcher.call(PLAIN, received, ...args),
    ]),
  ) as unknown as Table;
}

/** Returns the matchers whose calls report to recorders that read clock, and that start no guard. */
function clocked(clock: Controlled): Table {
  return chainOf({
    seat: () => new Recorder().withClock(clock),
    start: () => undefined,
  });
}

/** A check that passes, as the body of doesReject. */
function passes(inner: Seat): void {
  check.isTrue(inner, true, "it passes");
}

/**
 * A failing call of each matcher on the chain, by name: the subject, then
 * the other arguments. Each call fails as the entry of FAILING of the same
 * name fails.
 */
const CHAINED: Readonly<Record<string, (m: Table, clock: Controlled) => unknown>> = {
  isEqualTo: (m) => m.isEqualTo?.(1, 2, MSG),
  isNotEqualTo: (m) => m.isNotEqualTo?.(1, 1, MSG),
  isTrue: (m) => m.isTrue?.(false, MSG),
  isFalse: (m) => m.isFalse?.(true, MSG),
  isNil: (m) => m.isNil?.(0, MSG),
  isNotNil: (m) => m.isNotNil?.(null, MSG),
  hasLength: (m) => m.hasLength?.([1], 2, MSG),
  isEmpty: (m) => m.isEmpty?.([1], MSG),
  isNotEmpty: (m) => m.isNotEmpty?.([], MSG),
  doesContain: (m) => m.doesContain?.([1], 2, MSG),
  doesNotContain: (m) => m.doesNotContain?.([1], 1, MSG),
  containsInOrder: (m) => m.containsInOrder?.("ab", ["b", "a"], MSG),
  hasPrefix: (m) => m.hasPrefix?.("ab", "b", MSG),
  hasSuffix: (m) => m.hasSuffix?.("ab", "a", MSG),
  doesMatch: (m) => m.doesMatch?.("ab", "^b", MSG),
  isCloseTo: (m) => m.isCloseTo?.(1, 2, 0.5, MSG),
  inRange: (m) => m.inRange?.(5, 0, 1, MSG),
  pairwise: (m) => m.pairwise?.([2, 1], (a: number, b: number) => a < b, MSG),
  noError: (m) => m.noError?.(new Error("boom"), MSG),
  hasError: (m) => m.hasError?.(null, MSG),
  errorIs: (m) => m.errorIs?.(new Error("boom"), TypeError, MSG),
  errorIsNot: (m) => {
    const err = new Error("boom");
    return m.errorIsNot?.(err, err, MSG);
  },
  errorAs: (m) => m.errorAs?.(new Error("boom"), TypeError, MSG),
  doesThrow: (m) => m.doesThrow?.(() => 1, MSG),
  doesNotThrow: (m) =>
    m.doesNotThrow?.(() => {
      throw new Error("boom");
    }, MSG),
  doesReject: (m) => m.doesReject?.(passes, MSG),
  rejectsWith: (m) => m.rejectsWith?.(() => Promise.resolve(1), MSG),
  honoursCancellation: (m) => m.honoursCancellation?.(ignores, MSG),
  honoursDeadline: (m) => m.honoursDeadline?.(ignores, MSG),
  completesWithin: (m, clock) =>
    m.completesWithin?.(
      () => {
        clock.advance(5);
        return Promise.resolve();
      },
      0,
      MSG,
    ),
  nullHandleSafe: (m) =>
    m.nullHandleSafe?.(
      (signal: AbortSignal | undefined) => (signal as AbortSignal).aborted,
      MSG,
    ),
  isPure: (m) => {
    const state = [1];
    return m.isPure?.(
      () => state.push(2),
      () => [...state],
      MSG,
    );
  },
  eventually: (m) =>
    m.eventually?.(
      (trial: Seat) => check.isTrue(trial, false, "it converges"),
      5,
      1,
      MSG,
    ),
  eventuallyTrue: (m) => m.eventuallyTrue?.(() => false, 5, MSG),
  noTaskLeaks: async (m) => {
    let timer: NodeJS.Timeout | undefined;
    const outcome = await m.noTaskLeaks?.(() => {
      timer = setTimeout(() => undefined, 5000);
    }, MSG);
    clearTimeout(timer);
    return outcome;
  },
  isIdempotent: (m) => {
    const state: number[] = [];
    return m.isIdempotent?.(
      (x: number) => state.push(x),
      1,
      () => [...state],
      MSG,
    );
  },
  accumulates: (m) => {
    let cell = 0;
    return m.accumulates?.(
      (x: number) => {
        cell = x;
      },
      7,
      () => cell,
      MSG,
    );
  },
  isDeterministic: (m) => {
    let calls = 0;
    return m.isDeterministic?.(
      () => {
        calls += 1;
        return calls;
      },
      1,
      MSG,
    );
  },
  isCommutative: (m) => m.isCommutative?.((a: number, b: number) => a - b, 2, 3, MSG),
  isAssociative: (m) =>
    m.isAssociative?.((a: number, b: number) => a - b, 2, 3, 5, MSG),
  roundTrip: (m) =>
    m.roundTrip?.(
      (x: number) => String(Math.abs(x)),
      (text: string) => Number(text),
      -42,
      MSG,
    ),
  hasStableOrder: (m) => {
    let items = [1, 2, 3];
    return m.hasStableOrder?.(() => {
      items = [...items.slice(1), ...items.slice(0, 1)];
      return items;
    }, MSG);
  },
  noDuplicates: (m) => m.noDuplicates?.(() => [1, 2, 2, 3], MSG),
  isMonotonic: (m) => {
    let count = 0;
    return m.isMonotonic?.(
      () => count,
      () => {
        count = (count + 1) % 4;
      },
      5,
      MSG,
    );
  },
  isTotal: (m) =>
    m.isTotal?.(
      () => {
        throw new Error("refused");
      },
      [1, 2, 3],
      MSG,
    ),
  isNotPure: (m) =>
    m.isNotPure?.(
      () => undefined,
      () => 0,
      MSG,
    ),
  failsAfterClose: (m) => {
    let closed = false;
    return m.failsAfterClose?.(
      () => {
        if (!closed) throw new Error("the call ran before the close");
      },
      () => {
        closed = true;
      },
      new Error("closed"),
      MSG,
    );
  },
  isPoisoned: (m) => {
    let induced = false;
    return m.isPoisoned?.(
      () => {
        if (!induced) throw new Error("the reading ran before the failure");
      },
      () => {
        induced = true;
      },
      MSG,
    );
  },
  isPermutation: (m) => m.isPermutation?.([1, 1, 2], [1, 2, 2], MSG),
};

/** Returns the recorder of the failing call of name in the function form. */
async function reported(name: string): Promise<Recorder> {
  const clock = new Controlled(0);
  const seat = new Recorder().withClock(clock);
  if (name === "doesReject") await check.doesReject(seat, MSG, passes);
  else await FAILING[name as keyof typeof FAILING](check, seat, clock, MSG);
  return seat;
}

/** Returns a runner whose calls report to fresh recorders, and which records each call that it starts. */
function starting(started: { state: State; name: string; call: Call }[]): Runner {
  return {
    seat: () => new Recorder(),
    start: (state, name) => {
      const call = new Call(name);
      started.push({ state, name, call });
      return call;
    },
  };
}

describe("matchers", () => {
  describe("NAMES", () => {
    it("contains the name of each assertion of the function form", () => {
      expect(NAMES).toEqual(Object.keys(check).sort());
    });

    it("contains the name of each failing call of the spec", () => {
      expect(Object.keys(CHAINED).sort()).toEqual(NAMES);
    });
  });

  describe("SUBJECTS", () => {
    it("contains the names of assertions alone", () => {
      expect(Object.keys(SUBJECTS).filter((name) => !NAMES.includes(name))).toEqual([]);
    });
  });

  describe("NEGATIVES", () => {
    it("contains each pair in both directions", () => {
      for (const [name, negative] of NEGATIVES)
        expect(NEGATIVES.get(negative)).toBe(name);
    });

    it("contains the names of assertions alone", () => {
      expect([...NEGATIVES.keys()].filter((name) => !NAMES.includes(name))).toEqual([]);
    });
  });

  describe("matchers", () => {
    for (const name of NAMES) {
      it(`returns the failure of ${name} that its function form reports`, async () => {
        const want = await reported(name);
        const clock = new Controlled(0);
        const got = await (CHAINED[name]?.(clocked(clock), clock) as
          | Outcome
          | Promise<Outcome>);
        const failure = got.meta.failure;

        expect(got.pass).toBe(false);
        expect([failure?.assertion, failure?.contract]).toEqual([
          want.failures[0]?.assertion,
          want.failures[0]?.contract,
        ]);
        expect(Object.keys(failure?.detail ?? {})).toEqual(
          Object.keys(want.failures[0]?.detail ?? {}),
        );
        expect(got.message()).toBe(want.message);
      });
    }

    it("returns a pass with no failure for a call that passes", () => {
      const outcome = clocked(new Controlled(0)).isEqualTo?.(1, 1, MSG) as Outcome;

      expect([outcome.pass, outcome.meta, outcome.message()]).toEqual([
        true,
        {},
        "the assertion passed",
      ]);
    });

    it("returns the got and the want of a failure as the actual and the expected", () => {
      const outcome = clocked(new Controlled(0)).isEqualTo?.(1, 2, MSG) as Outcome;

      expect([outcome.actual, outcome.expected]).toEqual([1, 2]);
    });

    it("returns no actual for a failure without a got and a want", () => {
      const outcome = clocked(new Controlled(0)).isTrue?.(false, MSG) as Outcome;

      expect(Object.hasOwn(outcome, "actual")).toBe(false);
    });

    it("refuses a call under .not with the negative to call", () => {
      const isEqualTo = matchers({
        seat: () => new Recorder(),
        start: () => undefined,
      })["isEqualTo"] as (this: State, ...args: unknown[]) => Outcome;
      const outcome = isEqualTo.call({ isNot: true }, 1, 2, MSG);

      expect([outcome.pass, outcome.message()]).toEqual([
        true,
        "isEqualTo does not take .not. Call isNotEqualTo instead.",
      ]);
    });

    it("refuses a call under .not of an assertion without a negative", () => {
      const hasLength = matchers({
        seat: () => new Recorder(),
        start: () => undefined,
      })["hasLength"] as (this: State, ...args: unknown[]) => Outcome;

      expect(hasLength.call({ isNot: true }, [1], 1, MSG).message()).toBe(
        "hasLength does not take .not, and the standard has no negative of it.",
      );
    });

    it("starts the guard of an asynchronous call with its state and its name", async () => {
      const started: { state: State; name: string; call: Call }[] = [];
      await chainOf(starting(started)).rejectsWith?.(
        () => Promise.reject(new Error("no")),
        MSG,
      );

      expect(started.map(({ state, name }) => [state, name])).toEqual([
        [PLAIN, "rejectsWith"],
      ]);
      expect([started[0]?.call.settled, started[0]?.call.failed]).toEqual([
        true,
        false,
      ]);
    });

    it("starts no guard for a call whose function form returns the promise that the subject threw", () => {
      const started: { state: State; name: string; call: Call }[] = [];
      const outcome = chainOf(starting(started)).doesThrow?.(() => {
        throw Promise.resolve(1);
      }, MSG);

      expect([outcome instanceof Promise, started]).toEqual([false, []]);
    });

    it("settles the guard of a call that failed as failed", async () => {
      const started: { state: State; name: string; call: Call }[] = [];
      await chainOf(starting(started)).rejectsWith?.(() => Promise.resolve(1), MSG);

      expect(started[0]?.call.failed).toBe(true);
    });

    it("returns a pass for a call that its guard abandoned", async () => {
      const started: { state: State; name: string; call: Call }[] = [];
      const pending = chainOf(starting(started)).rejectsWith?.(
        () => Promise.resolve(1),
        MSG,
      );
      started[0]?.call.abandon();

      expect((await pending)?.pass).toBe(true);
    });

    it("rejects with the error of a scope that throws, and settles its guard as failed", async () => {
      const started: { state: State; name: string; call: Call }[] = [];
      const pending = chainOf(starting(started)).noTaskLeaks?.(() => {
        throw new Error("the scope broke");
      }, MSG);

      await expect(pending).rejects.toThrow("the scope broke");
      expect(started[0]?.call.failed).toBe(true);
    });
  });
});
