/**
 * The spec of the calls of a history as a check reads them, and of their
 * partitions, which are those of the definition's reference
 * implementation.
 */

import { describe } from "vitest";
import { History, recorded } from "../../src/history/history.js";
import {
  type Checked,
  callsOf,
  concurrency,
  partitionsOf,
  spanJson,
} from "../../src/history/partition.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Returns the calls of a history. */
function calls(history: History): Checked[] {
  const { events, ids } = recorded(history);
  return callsOf(events, ids);
}

/** Returns the invocations of the calls of each partition of a history. */
function grouped(history: History): number[][] {
  return partitionsOf(calls(history)).map((p) => p.calls.map((c) => c.span.call));
}

describe("partition", () => {
  describe("callsOf", () => {
    it("returns each call that did not fail with its completion and its output", ({
      seat,
    }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "write", [2], "x").fail("refused");
      history.invoke(2, "write", [3], "x").unknown("lost");
      history.invoke(3, "read", [], "x");

      check.equal(
        seat,
        calls(history).map(({ span }) => [
          span.call,
          span.completion,
          span.operation.known,
          span.operation.output,
        ]),
        [
          [0, 1, true, null],
          [4, 5, false, undefined],
          [6, undefined, false, undefined],
        ],
        "the ok, the unknown and the pending call",
      );
    });

    it("returns the keys of each call with their identities", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x", "y");
      const [call] = calls(history);

      check.equal(
        seat,
        [call?.keys, call?.ids],
        [
          ["x", "y"],
          ['{"type":"string","value":"x"}', '{"type":"string","value":"y"}'],
        ],
        "two keys",
      );
    });
  });

  describe("partitionsOf", () => {
    it("returns no partition for no call", ({ seat }) => {
      check.isEmpty(seat, partitionsOf([]), "no partition");
    });

    it("returns one partition of every key for a call that declares no key", ({
      seat,
    }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "read", []).ok(1);
      const [p] = partitionsOf(calls(history));

      check.equal(seat, [p?.keys, p?.calls.length], [[], 2], "one partition");
    });

    it("joins the calls that share a key in the order of their first invocation", ({
      seat,
    }) => {
      const history = new History();
      history.invoke(0, "write", [1], "y").ok(null);
      history.invoke(1, "read", [], "x").ok(null);
      history.invoke(2, "write", [2], "x", "z").ok(null);
      history.invoke(3, "read", [], "y").ok(1);

      check.equal(
        seat,
        grouped(history),
        [
          [0, 6],
          [2, 4],
        ],
        "y, then x and z",
      );
    });

    it("lists the keys of a partition in the order that the history first declares them", ({
      seat,
    }) => {
      const history = new History();
      history.invoke(0, "read", [], "x").ok(null);
      history.invoke(1, "write", [2], "y", "x").ok(null);

      check.equal(seat, partitionsOf(calls(history))[0]?.keys, ["x", "y"], "x, then y");
    });

    it("joins two partitions through a later call on both keys", ({ seat }) => {
      const history = new History();
      history.invoke(0, "read", [], "x").ok(null);
      history.invoke(1, "read", [], "y").ok(null);
      history.invoke(2, "write", [1], "y", "x").ok(null);

      check.equal(seat, grouped(history), [[0, 2, 4]], "one partition");
    });
  });

  describe("concurrency", () => {
    it("returns the most calls that are open at one event", ({ seat }) => {
      const history = new History();
      const a = history.invoke(0, "write", [1], "x");
      const b = history.invoke(1, "write", [2], "x");
      a.ok(null);
      history.invoke(0, "read", [], "x").ok(1);
      b.ok(null);

      check.equal(seat, concurrency(calls(history)), 2, "two at once");
    });

    it("counts a call that is not known as open to the end of the history", ({
      seat,
    }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").unknown("lost");
      history.invoke(0, "read", [], "x").ok(1);
      history.invoke(1, "read", [], "x").ok(1);

      check.equal(seat, concurrency(calls(history)), 2, "the unknown write and a read");
    });

    it("returns 0 for no call", ({ seat }) => {
      check.equal(seat, concurrency([]), 0, "none");
    });
  });

  describe("spanJson", () => {
    it("returns a known call with its completion and its output", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);

      check.equal(
        seat,
        spanJson((calls(history)[0] as Checked).span),
        {
          call: 0,
          completion: 1,
          process: 0,
          operation: "write",
          args: [{ type: "int", value: 1 }],
          output: { type: "null" },
        },
        "the history's JSON form",
      );
    });

    it("returns a pending call without a completion and an output", ({ seat }) => {
      const history = new History();
      history.invoke(0, "read", [], "x");

      check.equal(
        seat,
        spanJson((calls(history)[0] as Checked).span),
        { call: 0, process: 0, operation: "read", args: [] },
        "the invocation alone",
      );
    });

    it("returns a call whose outcome is unknown without an output", ({ seat }) => {
      const history = new History();
      history.invoke(0, "read", [], "x").unknown("lost");

      check.equal(
        seat,
        spanJson((calls(history)[0] as Checked).span),
        { call: 0, completion: 1, process: 0, operation: "read", args: [] },
        "no output",
      );
    });
  });
});
