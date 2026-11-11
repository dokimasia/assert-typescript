// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the internal consistency of the reads of a transaction. */

import { describe } from "vitest";
import { internalInconsistency } from "../../src/history/internal.js";
import { observation } from "../../src/history/reads.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { factsOf, okTxn } from "../helpers.js";

describe("internal", () => {
  describe("internalInconsistency", () => {
    it("returns a read that misses the transaction's own append", ({ seat }) => {
      const txn = okTxn(
        { fn: "append", key: "x", value: 1n },
        { fn: "read", key: "x", value: [] },
      );

      check.isEqualTo(
        seat,
        internalInconsistency(factsOf({ txns: [txn] }))?.explanation,
        [
          observation("internal-inconsistency", {
            calls: [0],
            key: "x",
            reads: [[]],
            expected: [1n],
          }),
        ],
        "the append of 1",
      );
    });

    it("returns a read of a value that the transaction appends after it", ({
      seat,
    }) => {
      const txn = okTxn(
        { fn: "read", key: "x", value: [2n] },
        { fn: "append", key: "x", value: 2n },
      );

      check.isEqualTo(
        seat,
        internalInconsistency(factsOf({ txns: [txn] }))?.explanation.map(
          (one) => "future" in one && one.future,
        ),
        [2n],
        "the future value 2",
      );
    });

    it("returns undefined for a transaction that reads its own appends", ({ seat }) => {
      const txn = okTxn(
        { fn: "append", key: "x", value: 1n },
        { fn: "read", key: "x", value: [0n, 1n] },
      );

      check.isNil(seat, internalInconsistency(factsOf({ txns: [txn] })), "consistent");
    });

    it("returns a register read of another value than the transaction wrote", ({
      seat,
    }) => {
      const txn = okTxn(
        { fn: "write", key: "x", value: 1n },
        { fn: "read", key: "x", value: [] },
      );

      check.isEqualTo(
        seat,
        internalInconsistency(factsOf({ register: true, txns: [txn] }))?.explanation,
        [
          observation("internal-inconsistency", {
            calls: [0],
            key: "x",
            register: true,
            known: 1n,
            whole: true,
          }),
        ],
        "the write of 1 and a read of the initial value",
      );
    });

    it("returns a register read of a value that the transaction writes after it", ({
      seat,
    }) => {
      const txn = okTxn(
        { fn: "read", key: "x", value: [2n] },
        { fn: "write", key: "x", value: 2n },
      );

      check.isEqualTo(
        seat,
        internalInconsistency(factsOf({ register: true, txns: [txn] }))?.explanation,
        [
          observation("internal-inconsistency", {
            calls: [0],
            key: "x",
            register: true,
            read: 2n,
            future: 2n,
            hasFuture: true,
          }),
        ],
        "the future value 2",
      );
    });

    it("returns undefined for a register transaction that reads its own writes", ({
      seat,
    }) => {
      const txn = okTxn(
        { fn: "write", key: "x", value: 1n },
        { fn: "write", key: "x", value: 2n },
        { fn: "read", key: "x", value: [2n] },
        { fn: "read", key: "x", value: [2n] },
      );

      check.isNil(
        seat,
        internalInconsistency(factsOf({ register: true, txns: [txn] })),
        "consistent",
      );
    });
  });
});
