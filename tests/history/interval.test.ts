/**
 * The spec of a history of calls with a start and an end. The orders and
 * the refusals are those of the definition's reference implementation.
 */

import { describe } from "vitest";
import {
  fromIntervals,
  type Interval,
  IntervalError,
} from "../../src/history/interval.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Returns a read of x by client, ok with a null output, or pending without an end. */
function read(client: number, start: number | bigint, end?: number | bigint): Interval {
  return end === undefined
    ? { client, operation: "read", args: [], keys: ["x"], start }
    : {
        client,
        operation: "read",
        args: [],
        keys: ["x"],
        start,
        end,
        kind: "ok",
        output: null,
      };
}

/** Returns the error that fromIntervals throws for entries, as its entry and its message. */
function refusal(entries: readonly Interval[]): [number, string] {
  try {
    fromIntervals(entries);
  } catch (err) {
    if (err instanceof IntervalError) return [err.entry, err.message];
    throw err;
  }
  return [-1, ""];
}

describe("interval", () => {
  describe("new IntervalError", () => {
    it("returns a RangeError that names the entry", ({ seat }) => {
      const err = new IntervalError(3, "ends at 1, before it starts at 2");

      check.equal(
        seat,
        [err instanceof RangeError, err.name, err.entry, err.message],
        [true, "IntervalError", 3, "history: entry 3 ends at 1, before it starts at 2"],
        "the error",
      );
    });
  });

  describe("fromIntervals", () => {
    it("puts an invocation before a completion at one time", ({ seat }) => {
      const events = fromIntervals([read(0, 0, 5), read(1, 5, 9)]).events();

      check.equal(
        seat,
        events.map((event) => [event.kind, event.call]),
        [
          ["invoke", 0],
          ["invoke", 1],
          ["ok", 0],
          ["ok", 1],
        ],
        "the read that starts at 5 is concurrent with the one that ends at 5",
      );
    });

    it("keeps the order of the entries among invocations at one time", ({ seat }) => {
      const events = fromIntervals([
        read(2, 5, 9),
        read(0, 5, 9),
        read(1, 0, 9),
      ]).events();

      check.equal(
        seat,
        events.map((event) => [event.kind, event.client]),
        [
          ["invoke", 1],
          ["invoke", 2],
          ["invoke", 0],
          ["ok", 2],
          ["ok", 0],
          ["ok", 1],
        ],
        "clients 2 and 0 in the order of their entries",
      );
    });

    it("records each completion kind with the process after an unknown call", ({
      seat,
    }) => {
      const entries: Interval[] = [
        {
          client: 0,
          operation: "write",
          args: [1],
          keys: ["x"],
          start: 0,
          end: 1,
          kind: "unknown",
          error: "timed out",
        },
        {
          client: 1,
          operation: "write",
          args: [2],
          keys: ["x"],
          start: 0,
          end: 1,
          kind: "fail",
          error: "refused",
        },
        {
          client: 0,
          operation: "read",
          args: [],
          keys: ["x"],
          start: 2,
          end: 3,
          kind: "ok",
          output: 1,
        },
        { client: 1, operation: "read", args: [], keys: ["x"], start: 2 },
      ];
      const events = fromIntervals(entries).events();

      check.equal(
        seat,
        events.map((event) => [event.kind, event.client, event.process]),
        [
          ["invoke", 0, 0],
          ["invoke", 1, 1],
          ["unknown", 0, 0],
          ["fail", 1, 1],
          ["invoke", 0, 2],
          ["invoke", 1, 1],
          ["ok", 0, 2],
        ],
        "client 0 moves to process 2, and the pending read has no completion",
      );
      check.equal(
        seat,
        [
          (events[2] as { error: unknown }).error,
          (events[3] as { error: unknown }).error,
          (events[6] as { output: unknown }).output,
        ],
        ["timed out", "refused", 1],
        "the errors and the output",
      );
    });

    it("compares times of bigints with times of numbers", ({ seat }) => {
      const events = fromIntervals([
        read(0, 2n ** 60n, 2n ** 60n + 1n),
        read(1, 0, 5),
      ]).events();

      check.equal(
        seat,
        events.map((event) => event.client),
        [1, 1, 0, 0],
        "the read at 0 first",
      );
    });

    it("accepts an entry that ends when it starts", ({ seat }) => {
      check.equal(seat, fromIntervals([read(0, 4, 4)]).events().length, 2, "one call");
    });

    it("accepts entries of one client that share no instant", ({ seat }) => {
      check.equal(
        seat,
        fromIntervals([read(0, 4, 6), read(0, 0, 3), read(1, 0, 9)]).events().length,
        6,
        "three calls",
      );
    });

    const tests: { name: string; give: Interval[]; want: [number, string] }[] = [
      {
        name: "an entry of one client that shares an instant with an earlier one",
        give: [read(0, 3, 6), read(0, 0, 3)],
        want: [1, "history: entry 1 overlaps entry 0 of client 0"],
      },
      {
        name: "an entry after a pending entry of its client",
        give: [read(0, 0, 1), read(0, 5), read(0, 9, 12)],
        want: [2, "history: entry 2 overlaps entry 1 of client 0"],
      },
      {
        name: "the first entry that ends before it starts",
        give: [read(0, 0, 2), read(1, 5, 3), read(0, 1, 3)],
        want: [1, "history: entry 1 ends at 3, before it starts at 5"],
      },
      {
        name: "an entry of a kind that completes no call",
        give: [
          {
            ...read(0, 0, 1),
            kind: "invoke" as unknown as "ok",
          },
        ],
        want: [0, 'history: entry 0 states the kind "invoke", which completes no call'],
      },
      {
        name: "an entry with an end and no kind",
        give: [{ client: 0, operation: "read", args: [], keys: [], start: 0, end: 1 }],
        want: [0, "history: entry 0 states a completion kind and an end, or neither"],
      },
      {
        name: "an entry with a kind and no end",
        give: [
          { client: 0, operation: "read", args: [], keys: [], start: 0, kind: "ok" },
        ],
        want: [0, "history: entry 0 states a completion kind and an end, or neither"],
      },
      {
        name: "an entry with a key that no typed literal states",
        give: [read(0, 0, 1), { ...read(1, 0, 1), keys: ["x", Symbol.for("k")] }],
        want: [
          1,
          "history: entry 1 states the key Symbol(k), which no typed literal states",
        ],
      },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.equal(seat, refusal(tt.give), tt.want, "the entry and the message");
      });
    }
  });
});
