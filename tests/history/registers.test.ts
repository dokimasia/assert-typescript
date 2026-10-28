// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the edges between the committed transactions of a register history. */

import { describe } from "vitest";
import type { Edge } from "../../src/history/anomaly.js";
import { History } from "../../src/history/history.js";
import { id, nameOf } from "../../src/history/reads.js";
import { registerEdges } from "../../src/history/registers.js";
import { transactions } from "../../src/history/transaction.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { invokeTxn, readOf, runTxn, write } from "../helpers.js";

/**
 * Returns the edges of a register history in the order derived. The
 * committed transactions are the ok ones, and later has the value that the
 * writer of each write wrote after it.
 */
function edgesOf(
  history: History,
  later: ReadonlyMap<string, unknown> = new Map(),
): Edge[] {
  const txns = transactions(history.events());
  const keys = new Map(
    txns.flatMap((txn) => txn.mops.map((mop) => [id(mop.key), mop.key] as const)),
  );
  const writers = new Map(
    txns.flatMap((txn) =>
      txn.mops
        .filter((mop) => mop.fn === "write")
        .map((mop) => [nameOf(mop.key, mop.value), txn.call] as const),
    ),
  );
  const committed = new Set(
    txns.filter((txn) => txn.kind === "ok").map((txn) => txn.call),
  );
  return [...registerEdges(txns, committed, keys, later, writers).values()].flat();
}

describe("registers", () => {
  describe("registerEdges", () => {
    it("returns the ww and the wr edges of an overwrite of a read value", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, write("x", 1));
      runTxn(history, 1, readOf("x", 1), write("x", 2));

      check.isEqualTo(
        seat,
        edgesOf(history),
        [
          {
            from: 0,
            to: 2,
            relation: "ww",
            key: "x",
            value: 1,
            empty: false,
            next: 2,
            register: true,
          },
          {
            from: 0,
            to: 2,
            relation: "wr",
            key: "x",
            value: 1,
            empty: false,
            next: undefined,
            register: true,
          },
        ],
        "the pair of 1 and 2 orders call 0 before call 2",
      );
    });

    it("returns an empty rw edge of a read of the initial value", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, readOf("x", null));
      runTxn(history, 1, write("x", 2));

      check.isEqualTo(
        seat,
        edgesOf(history),
        [
          {
            from: 0,
            to: 2,
            relation: "rw",
            key: "x",
            value: undefined,
            empty: true,
            next: 2,
            register: true,
          },
        ],
        "the initial value precedes 2",
      );
    });

    it("leaves out the reads and the writes of a transaction that did not commit", ({
      seat,
    }) => {
      const history = new History();
      invokeTxn(history, 0, readOf("x", null), write("x", 1)).fail("aborted");

      check.isEqualTo(seat, edgesOf(history), [], "no edge");
    });

    it("leaves out the edges of a value that no committed transaction installed", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, write("x", 5), write("x", 6));
      runTxn(history, 1, readOf("x", 5));
      runTxn(history, 2, readOf("x", 7));

      check.isEqualTo(
        seat,
        edgesOf(history, new Map([[nameOf("x", 5), 6]])),
        [],
        "call 0 overwrote 5, and no transaction wrote 7",
      );
    });
  });
});
