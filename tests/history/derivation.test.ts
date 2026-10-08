/**
 * The spec of the derivation over the transactions of a history: the first
 * instance of each anomaly, with its cycle and its evidence. Each instance
 * is the one that the definition's reference implementation finds in the
 * same history.
 */

import { describe } from "vitest";
import {
  ANOMALIES,
  Analysis,
  type Anomaly,
  type Instance,
  type Observation,
} from "../../src/history/derivation.js";
import { History } from "../../src/history/history.js";
import { transactions } from "../../src/history/transaction.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { append, invokeTxn, readOf, readSkew, runTxn, writeSkew } from "../helpers.js";

/** Returns the first instance of an anomaly in a history. */
function instance(history: History, anomaly: Anomaly): Instance | undefined {
  return new Analysis(transactions(history.events())).instance(anomaly);
}

/** Returns the calls of the cycle of the first instance of an anomaly in a history. */
function cycleOf(history: History, anomaly: Anomaly): number[] | undefined {
  return instance(history, anomaly)?.cycle?.map((link) => link.call);
}

/** Returns the observation of an anomaly of fields, with the other fields empty. */
function observed(anomaly: Anomaly, fields: Partial<Observation>): Observation {
  return {
    anomaly,
    calls: [],
    key: undefined,
    reads: [],
    value: undefined,
    appender: undefined,
    next: undefined,
    expected: [],
    whole: false,
    future: undefined,
    hasFuture: false,
    ...fields,
  };
}

/** Returns a history of calls 0 and 1 that append to x in one order and to y in the other. */
function crossedAppends(): History {
  const history = new History();
  const first = invokeTxn(history, 0, append("x", 1), append("y", 4));
  const second = invokeTxn(history, 1, append("x", 2), append("y", 3));
  first.ok([append("x", 1), append("y", 4)]);
  second.ok([append("x", 2), append("y", 3)]);
  runTxn(history, 2, readOf("x", [1, 2]), readOf("y", [3, 4]));
  return history;
}

describe("derivation", () => {
  describe("ANOMALIES", () => {
    it("lists the eleven kinds in report order", ({ seat }) => {
      check.equal(
        seat,
        ANOMALIES,
        [
          "garbage-read",
          "duplicate-append",
          "internal-inconsistency",
          "incompatible-order",
          "aborted-read",
          "intermediate-read",
          "G0",
          "G1c",
          "G-single",
          "G-nonadjacent",
          "G2",
        ],
        "the kinds",
      );
    });
  });

  describe("new Analysis", () => {
    it("derives no anomaly of a serial history", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1));
      runTxn(history, 1, readOf("x", [1]), append("x", 2));
      runTxn(history, 0, readOf("x", [1, 2]));
      const analysis = new Analysis(transactions(history.events()));

      check.isEmpty(
        seat,
        ANOMALIES.filter((kind) => analysis.instance(kind) !== undefined),
        "no kind",
      );
    });

    it("derives no anomaly of a read of the transaction's own intermediate append", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), readOf("x", [1]), append("x", 2));
      runTxn(history, 1, readOf("x", [1, 2]));
      const analysis = new Analysis(transactions(history.events()));

      check.isEmpty(
        seat,
        ANOMALIES.filter((kind) => analysis.instance(kind) !== undefined),
        "no kind",
      );
    });
  });

  describe("Analysis.instance", () => {
    it("returns a garbage read of a value that no call appended", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, readOf("x", [9]));

      check.equal(
        seat,
        instance(history, "garbage-read"),
        {
          anomaly: "garbage-read",
          calls: [0],
          cycle: undefined,
          explanation: [
            observed("garbage-read", { calls: [0], key: "x", reads: [[9]], value: 9 }),
          ],
        },
        "the read of 9",
      );
    });

    it("returns a duplicate append of a read that returned one value twice", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1));
      runTxn(history, 1, readOf("x", [1, 1]));

      check.equal(
        seat,
        instance(history, "duplicate-append")?.explanation,
        [
          observed("duplicate-append", {
            calls: [2],
            key: "x",
            reads: [[1, 1]],
            value: 1,
          }),
        ],
        "the read of 1 twice",
      );
    });

    it("returns an internal inconsistency of a read that lacks the call's own append", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1));
      runTxn(history, 1, append("x", 2), readOf("x", [1]));

      check.equal(
        seat,
        instance(history, "internal-inconsistency")?.explanation,
        [
          observed("internal-inconsistency", {
            calls: [2],
            key: "x",
            reads: [[1]],
            expected: [2],
          }),
        ],
        "the list ends with 2",
      );
    });

    it("returns an internal inconsistency of a read of the call's own later append", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, readOf("x", [1]), append("x", 1));

      check.equal(
        seat,
        instance(history, "internal-inconsistency")?.explanation,
        [
          observed("internal-inconsistency", {
            calls: [0],
            key: "x",
            reads: [[1]],
            future: 1,
            hasFuture: true,
          }),
        ],
        "1 is appended after the read",
      );
    });

    it("returns an internal inconsistency of a read that differs from the call's earlier read", ({
      seat,
    }) => {
      const history = new History();
      const reader = invokeTxn(history, 0, readOf("x", null), readOf("x", null));
      runTxn(history, 1, append("x", 1));
      reader.ok([readOf("x", []), readOf("x", [1])]);

      check.equal(
        seat,
        instance(history, "internal-inconsistency")?.explanation,
        [
          observed("internal-inconsistency", {
            calls: [0],
            key: "x",
            reads: [[1]],
            whole: true,
          }),
        ],
        "the call knew the list was empty",
      );
    });

    it("returns an incompatible order of two reads that are no prefixes of one list", ({
      seat,
    }) => {
      const history = new History();
      for (const value of [1, 2, 3]) runTxn(history, value, append("x", value));
      runTxn(history, 0, readOf("x", [1, 2]));
      runTxn(history, 0, readOf("x", [1, 3]));

      check.equal(
        seat,
        instance(history, "incompatible-order"),
        {
          anomaly: "incompatible-order",
          calls: [6, 8],
          cycle: undefined,
          explanation: [
            observed("incompatible-order", {
              calls: [6, 8],
              key: "x",
              reads: [
                [1, 2],
                [1, 3],
              ],
            }),
          ],
        },
        "the reads of calls 6 and 8",
      );
    });

    it("returns the incompatible order of the key that the history states first", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, append("y", 1));
      runTxn(history, 1, append("y", 2));
      runTxn(history, 2, append("x", 1));
      runTxn(history, 3, append("x", 2));
      runTxn(history, 0, readOf("x", [1]));
      runTxn(history, 0, readOf("x", [2]));
      runTxn(history, 0, readOf("y", [1]));
      runTxn(history, 0, readOf("y", [2]));

      check.equal(
        seat,
        instance(history, "incompatible-order")?.explanation,
        [
          observed("incompatible-order", {
            calls: [12, 14],
            key: "y",
            reads: [[1], [2]],
          }),
        ],
        "the reads of y",
      );
    });

    it("returns an aborted read of a value that a failed call appended", ({ seat }) => {
      const history = new History();
      invokeTxn(history, 0, append("x", 1)).fail("aborted");
      runTxn(history, 1, readOf("x", [1]));

      check.equal(
        seat,
        instance(history, "aborted-read"),
        {
          anomaly: "aborted-read",
          calls: [2, 0],
          cycle: undefined,
          explanation: [
            observed("aborted-read", { calls: [2], key: "x", value: 1, appender: 0 }),
          ],
        },
        "the read of call 0's 1",
      );
    });

    it("returns an intermediate read of a value that its appender followed", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), append("x", 2));
      runTxn(history, 1, readOf("x", [1]));

      check.equal(
        seat,
        instance(history, "intermediate-read")?.explanation,
        [
          observed("intermediate-read", {
            calls: [2],
            key: "x",
            value: 1,
            appender: 0,
            next: 2,
          }),
        ],
        "1 is followed by 2",
      );
    });

    it("returns a G0 cycle of write dependencies with the evidence of each", ({
      seat,
    }) => {
      check.equal(
        seat,
        instance(crossedAppends(), "G0"),
        {
          anomaly: "G0",
          calls: [0, 1],
          cycle: [
            { call: 0, relations: ["ww"] },
            { call: 1, relations: ["ww"] },
          ],
          explanation: [
            {
              from: 0,
              to: 1,
              relation: "ww",
              key: "x",
              value: 1,
              empty: false,
              next: 2,
            },
            {
              from: 1,
              to: 0,
              relation: "ww",
              key: "y",
              value: 3,
              empty: false,
              next: 4,
            },
          ],
        },
        "x orders 0 first, and y orders 1 first",
      );
    });

    it("drops an edge from a transaction to itself", ({ seat }) => {
      const history = new History();
      runTxn(
        history,
        0,
        append("x", 1),
        append("x", 2),
        append("y", 1),
        append("z", 4),
      );
      runTxn(history, 1, append("y", 2), append("z", 3));
      runTxn(history, 2, readOf("x", [1, 2]), readOf("y", [1, 2]), readOf("z", [3, 4]));

      check.equal(seat, cycleOf(history, "G0"), [0, 2], "the cycle of calls 0 and 2");
    });

    it("returns a G1c cycle of calls that each read the other's append", ({ seat }) => {
      const history = new History();
      const first = invokeTxn(history, 0, append("x", 1), readOf("y", null));
      const second = invokeTxn(history, 1, append("y", 2), readOf("x", null));
      first.ok([append("x", 1), readOf("y", [2])]);
      second.ok([append("y", 2), readOf("x", [1])]);

      check.equal(
        seat,
        instance(history, "G1c")?.cycle,
        [
          { call: 0, relations: ["wr"] },
          { call: 1, relations: ["wr"] },
        ],
        "two wr edges",
      );
    });

    it("returns a G-single cycle of a read skew with an empty rw edge", ({ seat }) => {
      check.equal(
        seat,
        instance(readSkew("ok", true), "G-single"),
        {
          anomaly: "G-single",
          calls: [0, 1],
          cycle: [
            { call: 0, relations: ["rw"] },
            { call: 1, relations: ["wr"] },
          ],
          explanation: [
            {
              from: 0,
              to: 1,
              relation: "rw",
              key: "x",
              value: undefined,
              empty: true,
              next: 1,
            },
            {
              from: 1,
              to: 0,
              relation: "wr",
              key: "y",
              value: 2,
              empty: false,
              next: undefined,
            },
          ],
        },
        "call 0 reads x empty and y with 2",
      );
    });

    it("lists only rw for the closing edge of a G-single cycle", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), readOf("y", []), readOf("z", [7]));
      runTxn(history, 1, append("x", 2), append("y", 5), append("z", 7));
      runTxn(history, 2, readOf("x", [1, 2]));

      check.equal(
        seat,
        instance(history, "G-single")?.cycle,
        [
          { call: 0, relations: ["rw"] },
          { call: 2, relations: ["wr"] },
        ],
        "the rw of y alone",
      );
    });

    it("reduces a walk with two adjacent rw edges to a G-single cycle alone", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, readOf("k1", []), readOf("k6", [6]));
      runTxn(history, 1, append("k1", 1), append("k2", "b"));
      runTxn(
        history,
        2,
        append("k2", "v"),
        readOf("k3", []),
        append("k5", 5),
        append("k6", 6),
      );
      runTxn(history, 3, append("k3", 3), append("k4", "p"));
      runTxn(history, 4, append("k4", "q"), readOf("k5", []));
      runTxn(history, 5, readOf("k2", ["b", "v"]), readOf("k4", ["p", "q"]));

      check.equal(
        seat,
        [
          instance(history, "G-single") !== undefined,
          instance(history, "G-nonadjacent"),
        ],
        [true, undefined],
        "the loop 4, 6, 8 has two adjacent rw edges",
      );
    });

    it("orders an unobserved append after its own transaction's read", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), readOf("x", [1]), readOf("y", [3]));
      runTxn(history, 1, append("x", 2), append("y", 3));

      check.equal(
        seat,
        instance(history, "G1c")?.cycle,
        [
          { call: 2, relations: ["wr"] },
          { call: 0, relations: ["ww"] },
        ],
        "the append of 2 follows the 1 that call 0 read",
      );
    });

    it("returns a G2 cycle of two adjacent rw edges for a write skew", ({ seat }) => {
      check.equal(
        seat,
        instance(writeSkew(), "G2")?.cycle,
        [
          { call: 0, relations: ["rw"] },
          { call: 1, relations: ["rw"] },
        ],
        "each call reads the key that the other appends to",
      );
    });

    it("returns no G-single cycle for a write skew", ({ seat }) => {
      check.isNil(seat, instance(writeSkew(), "G-single"), "two rw edges");
    });

    it("returns no G-nonadjacent cycle for a write skew", ({ seat }) => {
      check.isNil(
        seat,
        instance(writeSkew(), "G-nonadjacent"),
        "two adjacent rw edges",
      );
    });

    it("returns a G-nonadjacent cycle of a long fork", ({ seat }) => {
      const history = new History();
      const calls = [
        invokeTxn(history, 0, append("x", 1)),
        invokeTxn(history, 1, append("y", 2)),
        invokeTxn(history, 2, readOf("x", null), readOf("y", null)),
        invokeTxn(history, 3, readOf("x", null), readOf("y", null)),
      ];
      calls[0]?.ok([append("x", 1)]);
      calls[1]?.ok([append("y", 2)]);
      calls[2]?.ok([readOf("x", [1]), readOf("y", [])]);
      calls[3]?.ok([readOf("x", []), readOf("y", [2])]);

      check.equal(
        seat,
        instance(history, "G-nonadjacent")?.cycle,
        [
          { call: 2, relations: ["rw"] },
          { call: 1, relations: ["wr"] },
          { call: 3, relations: ["rw"] },
          { call: 0, relations: ["wr"] },
        ],
        "two rw edges apart",
      );
    });

    it("orders an unobserved append after the last observed value", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("k1", 1));
      runTxn(history, 1, readOf("k1", [1]));
      runTxn(history, 2, readOf("k0", []), append("k1", 2));
      runTxn(history, 3, readOf("k1", []), append("k0", 1));

      check.equal(seat, cycleOf(history, "G2"), [2, 4, 6, 0], "the cycle 2, 4, 6, 0");
    });

    it("drops the inference of an unobserved append that did not commit", ({
      seat,
    }) => {
      const history = new History();
      const first = invokeTxn(history, 0, readOf("x", null), append("y", 1));
      const second = invokeTxn(history, 1, readOf("y", null), append("x", 2));
      first.ok([readOf("x", []), append("y", 1)]);
      second.unknown("timed out");

      check.isNil(seat, instance(history, "G2"), "no cycle");
    });

    for (const completes of ["unknown", undefined] as const) {
      it(`takes a call that completes as ${completes ?? "pending"} as committed when a read observed it`, ({
        seat,
      }) => {
        check.equal(
          seat,
          cycleOf(readSkew(completes, true), "G-single"),
          [0, 1],
          "the read skew",
        );
      });

      it(`leaves out a call that completes as ${completes ?? "pending"} when no read observed it`, ({
        seat,
      }) => {
        const analysis = new Analysis(
          transactions(readSkew(completes, false).events()),
        );

        check.isEmpty(
          seat,
          ANOMALIES.filter((kind) => analysis.instance(kind) !== undefined),
          "no kind",
        );
      });
    }

    it("returns the cycle of the component with the lowest call", ({ seat }) => {
      const history = writeSkew();
      const third = invokeTxn(history, 2, readOf("a", null), append("b", 1));
      const fourth = invokeTxn(history, 3, readOf("b", null), append("a", 2));
      third.ok([readOf("a", []), append("b", 1)]);
      fourth.ok([readOf("b", []), append("a", 2)]);

      check.equal(seat, cycleOf(history, "G2"), [0, 1], "the first write skew");
    });

    it("returns the shortest path back from the closing edge", ({ seat }) => {
      const history = new History();
      const zero = invokeTxn(
        history,
        0,
        append("x", 1),
        readOf("y", null),
        readOf("z", null),
      );
      const one = invokeTxn(history, 1, append("y", 2), readOf("x", null));
      const two = invokeTxn(history, 2, append("z", 3), readOf("y", null));
      zero.ok([append("x", 1), readOf("y", [2]), readOf("z", [3])]);
      one.ok([append("y", 2), readOf("x", [1])]);
      two.ok([append("z", 3), readOf("y", [2])]);

      check.equal(seat, cycleOf(history, "G1c"), [0, 1], "calls 0 and 1");
    });

    it("returns a G-single cycle of the component that has one", ({ seat }) => {
      const history = writeSkew();
      const reader = invokeTxn(history, 2, readOf("a", null), readOf("b", null));
      const writer = invokeTxn(history, 3, append("a", 1), append("b", 2));
      writer.ok([append("a", 1), append("b", 2)]);
      reader.ok([readOf("a", []), readOf("b", [2])]);

      check.equal(seat, cycleOf(history, "G-single"), [4, 5], "the read skew");
    });
  });
});
