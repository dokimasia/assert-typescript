/**
 * The spec of the search of one partition. Each verdict, each count of
 * steps and each frontier is that of the definition's reference
 * implementation on the same calls and spec.
 */

import { describe, onTestFinished, vi } from "vitest";
import { History, recorded } from "../../src/history/history.js";
import {
  budget,
  configure,
  memoLimit,
  type Option,
  timeLimit,
} from "../../src/history/option.js";
import { callsOf } from "../../src/history/partition.js";
import { type Ending, Search, SpecError } from "../../src/history/search.js";
import { CallOperation, type Spec, specFrom } from "../../src/history/spec.js";
import { check, equateNans } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { REGISTER } from "../helpers.js";

/** Returns how the search of every call of a history against spec ends, under options. */
function searched<S>(history: History, spec: Spec<S>, ...options: Option[]): Ending<S> {
  const { events, ids } = recorded(history);
  const config = configure(options);
  const deadline =
    config.timeLimit > 0
      ? performance.now() + config.timeLimit
      : Number.POSITIVE_INFINITY;
  return new Search(callsOf(events, ids), spec, config, deadline).run();
}

/** Returns a write of 1, then a read of 1 by another client. */
function writeThenRead(): History {
  const history = new History();
  history.invoke(0, "write", [1], "x").ok(null);
  history.invoke(1, "read", [], "x").ok(1);
  return history;
}

/** Returns two concurrent writes of value, then a read of 5. */
function writes(value: unknown): History {
  const history = new History();
  const first = history.invoke(0, "write", [value], "x");
  const second = history.invoke(1, "write", [value], "x");
  first.ok(null);
  second.ok(null);
  history.invoke(0, "read", [], "x").ok(5);
  return history;
}

/** A lock: acquire(c) takes a free lock for c, and release(c) frees it. */
const LOCK: Spec<unknown> = {
  initial: () => null,
  next: (state, op) => {
    const [client] = op.args;
    if (op.name === "acquire") return state === null ? [client] : [];
    return state === client ? [null] : [];
  },
};

/** The register whose write may be lost: a write leaves the new value, then the old one. */
const LOSSY: Spec<unknown> = {
  initial: () => null,
  next: (state, op) =>
    op.name === "write" ? [op.args[0], state] : REGISTER.next(state, op),
};

/** Returns the factory of a counter subject, whose add(n) adds n and outputs the new total. */
function counter(): (operation: string, args: readonly unknown[]) => unknown {
  let total = 0;
  return (_operation, args) => {
    total += args[0] as number;
    return total;
  };
}

/** Returns the SpecError that the search of history against spec throws. */
function specError(history: History, spec: Spec<unknown>): SpecError | undefined {
  try {
    searched(history, spec);
  } catch (err) {
    return err as SpecError;
  }
  return undefined;
}

describe("search", () => {
  describe("new SpecError", () => {
    it("returns the error of a function that threw on a stepped call", ({ seat }) => {
      const cause = new Error("boom");
      const err = new SpecError(
        "next",
        { call: 4, operation: new CallOperation("read", [], true, 1) },
        cause,
      );

      check.equal(
        seat,
        [err.name, err.message, err.fn, err.call, err.operation, err.cause],
        ["SpecError", 'the spec\'s next throws on "read"', "next", 4, "read", cause],
        "the fields",
      );
    });

    it("returns the error of a function that threw before the first step", ({
      seat,
    }) => {
      const err = new SpecError("initial", undefined, "boom");

      check.equal(
        seat,
        [err.message, err.call, err.operation],
        ["the spec's initial throws", undefined, undefined],
        "no call",
      );
    });
  });

  describe("Search.run", () => {
    it("returns a pass with the states after the order it found", ({ seat }) => {
      check.equal(
        seat,
        searched(writeThenRead(), REGISTER),
        {
          outcome: "passed",
          steps: 2,
          linearized: [],
          states: [1],
          candidates: [],
          limit: undefined,
        },
        "the state 1",
      );
    });

    it("returns the frontier of a violation", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(2);

      check.equal(
        seat,
        searched(history, REGISTER),
        {
          outcome: "violated",
          steps: 2,
          linearized: [0],
          states: [1],
          candidates: [1],
          limit: undefined,
        },
        "the write, and the rejected read",
      );
    });

    it("backtracks to try another order of two concurrent calls", ({ seat }) => {
      const history = new History();
      const first = history.invoke(0, "write", [1], "x");
      const second = history.invoke(1, "write", [2], "x");
      first.ok(null);
      second.ok(null);
      history.invoke(0, "read", [], "x").ok(1);
      const ending = searched(history, REGISTER);

      check.equal(
        seat,
        [ending.outcome, ending.steps],
        ["passed", 6],
        "the sixth step",
      );
    });

    it("lists only the candidates that the spec rejects at the frontier", ({
      seat,
    }) => {
      const history = new History();
      const first = history.invoke(0, "write", [1], "x");
      const second = history.invoke(1, "write", [2], "x");
      const reader = history.invoke(2, "read", [], "x");
      first.ok(null);
      second.ok(null);
      reader.ok(3);

      check.equal(
        seat,
        searched(history, REGISTER),
        {
          outcome: "violated",
          steps: 9,
          linearized: [0, 1],
          states: [2],
          candidates: [2],
          limit: undefined,
        },
        "the read once, after the two writes",
      );
    });

    it("passes a write whose outcome is unknown that takes effect later", ({
      seat,
    }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      const lost = history.invoke(1, "write", [2], "x");
      history.invoke(0, "read", [], "x").ok(1);
      lost.unknown("timed out");
      history.invoke(0, "read", [], "x").ok(2);

      check.equal(
        seat,
        searched(history, REGISTER),
        {
          outcome: "passed",
          steps: 6,
          linearized: [],
          states: [2],
          candidates: [],
          limit: undefined,
        },
        "the lost write takes effect between the reads",
      );
    });

    it("passes a call whose outcome is unknown that never takes effect", ({ seat }) => {
      const history = new History();
      history.invoke(0, "acquire", [0], "lock").ok(null);
      history.invoke(1, "acquire", [1], "lock").unknown("timed out");
      history.invoke(2, "acquire", [2], "lock");

      check.equal(
        seat,
        searched(history, LOCK),
        {
          outcome: "passed",
          steps: 1,
          linearized: [],
          states: [0],
          candidates: [],
          limit: undefined,
        },
        "client 0 has the lock",
      );
    });

    it("passes a pending write that a later read needs", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x");
      history.invoke(1, "read", [], "x").ok(1);

      check.equal(
        seat,
        searched(history, REGISTER),
        {
          outcome: "passed",
          steps: 2,
          linearized: [],
          states: [1],
          candidates: [],
          limit: undefined,
        },
        "the pending write takes effect before the read",
      );
    });

    it("backtracks over a call whose outcome is unknown", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x");
      history.invoke(1, "write", [2], "x").unknown("timed out");
      history.invoke(2, "read", [], "x").ok(9);

      check.equal(
        seat,
        searched(history, REGISTER),
        {
          outcome: "violated",
          steps: 9,
          linearized: [0, 1],
          states: [2],
          candidates: [2],
          limit: undefined,
        },
        "no order of the writes outputs 9",
      );
    });

    it("keeps one of each group of equal states", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(0, "read", [], "x").ok(7);

      check.equal(
        seat,
        searched(history, LOSSY),
        {
          outcome: "violated",
          steps: 5,
          linearized: [0, 1],
          states: [1, null],
          candidates: [2],
          limit: undefined,
        },
        "the states 1 and null",
      );
    });

    it("skips a configuration that the memo contains", ({ seat }) => {
      check.equal(
        seat,
        searched(writes(1), REGISTER),
        {
          outcome: "violated",
          steps: 5,
          linearized: [0, 1],
          states: [1],
          candidates: [2],
          limit: undefined,
        },
        "the second order of the writes is skipped",
      );
    });

    it("never merges a state that contains a NaN", ({ seat }) => {
      check.equal(
        seat,
        searched(writes(Number.NaN), REGISTER),
        {
          outcome: "violated",
          steps: 6,
          linearized: [0, 1],
          states: [Number.NaN],
          candidates: [2],
          limit: undefined,
        },
        "the second order of the writes is searched",
        equateNans(),
      );
    });

    it("merges two lists of states only at one length", ({ seat }) => {
      // The states after a and b. A state without an entry steps to itself.
      const after: Record<string, Record<number, number[]>> = {
        a: { 0: [1, 2], 5: [1] },
        b: { 0: [5] },
      };
      const paths: Spec<number> = {
        initial: () => 0,
        next: (state, op) =>
          op.name === "c" ? [] : (after[op.name]?.[state] ?? [state]),
        key: () => "0",
      };
      const history = new History();
      const a = history.invoke(0, "a", [], "x");
      const b = history.invoke(1, "b", [], "x");
      a.ok(null);
      b.ok(null);
      history.invoke(2, "c", [], "x").ok(null);

      check.equal(
        seat,
        searched(history, paths),
        {
          outcome: "violated",
          steps: 8,
          linearized: [0, 1],
          states: [1, 2],
          candidates: [2],
          limit: undefined,
        },
        "eight steps",
      );
    });

    it("costs a step of a spec from a subject its depth plus one", ({ seat }) => {
      const history = new History();
      history.invoke(0, "add", [1]).ok(1);
      history.invoke(1, "add", [2]).ok(3);
      const spec = specFrom(counter);
      const passed = searched(history, spec);
      const stopped = searched(history, spec, budget(2));

      check.equal(
        seat,
        [passed.outcome, passed.steps, stopped.outcome, stopped.limit, stopped.steps],
        ["passed", 3, "undecided", "steps", 1],
        "the second add replays the first",
      );
    });

    it("stops before a step past its budget", ({ seat }) => {
      const ending = searched(writeThenRead(), REGISTER, budget(1));

      check.equal(
        seat,
        [ending.outcome, ending.limit, ending.steps, ending.linearized, ending.states],
        ["undecided", "steps", 1, [0], [1]],
        "one step",
      );
    });

    it("stops before a configuration past its memo limit", ({ seat }) => {
      const ending = searched(writeThenRead(), REGISTER, memoLimit(3));

      check.equal(
        seat,
        [ending.outcome, ending.limit, ending.steps, ending.linearized],
        ["undecided", "memo", 2, [0]],
        "the second configuration needs four bits",
      );
    });

    it("stops once its time has passed", ({ seat }) => {
      const now = vi
        .spyOn(performance, "now")
        .mockReturnValueOnce(0)
        .mockReturnValue(5);
      onTestFinished(() => now.mockRestore());
      const ending = searched(writeThenRead(), REGISTER, timeLimit(1));

      check.equal(
        seat,
        [ending.outcome, ending.limit, ending.steps],
        ["undecided", "time", 0],
        "before the first step",
      );
    });

    it("reads the clock once in 1,024 steps", ({ seat }) => {
      const now = vi.spyOn(performance, "now");
      onTestFinished(() => now.mockRestore());
      const ending = searched(writeThenRead(), REGISTER, timeLimit(60_000));

      check.equal(
        seat,
        [ending.outcome, now.mock.calls.length],
        ["passed", 2],
        "at the check and before the first step",
      );
    });

    it("compares the states with the spec's equal", ({ seat }) => {
      const parity: Spec<number> = {
        initial: () => 0,
        next: (state, op) =>
          op.name === "write"
            ? [op.args[0] as number, 2]
            : op.returned(state % 2)
              ? [state]
              : [],
        equal: (a, b) => a % 2 === b % 2,
        key: (state) => String(state % 2),
      };
      const history = new History();
      history.invoke(0, "write", [4], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(0);
      const ending = searched(history, parity);

      check.equal(
        seat,
        [ending.outcome, ending.states],
        ["passed", [4]],
        "4 and 2 are one state",
      );
    });

    const tests: {
      name: string;
      give: Partial<Spec<unknown>>;
      want: [string, number | undefined];
    }[] = [
      {
        name: "initial",
        give: {
          initial: () => {
            throw new Error("boom");
          },
        },
        want: ["initial", undefined],
      },
      {
        name: "next",
        give: {
          next: () => {
            throw new Error("boom");
          },
        },
        want: ["next", 0],
      },
      {
        name: "equal",
        give: {
          next: () => [1, 2],
          equal: () => {
            throw new Error("boom");
          },
        },
        want: ["equal", 0],
      },
      {
        name: "key",
        give: {
          key: () => {
            throw new Error("boom");
          },
        },
        want: ["key", 0],
      },
    ];
    for (const tt of tests) {
      it(`throws a SpecError at the stepped call for a ${tt.name} that throws`, ({
        seat,
      }) => {
        const err = specError(writeThenRead(), { ...REGISTER, ...tt.give });

        check.equal(seat, [err?.fn, err?.call], tt.want, "the function and the call");
      });
    }
  });
});
