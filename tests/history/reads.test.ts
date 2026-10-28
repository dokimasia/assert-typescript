// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the anomalies that the reads of a history show without a cycle. */

import { describe } from "vitest";
import { identityOf } from "../../src/history/history.js";
import {
  abortedRead,
  duplicateAppend,
  type Facts,
  garbageRead,
  id,
  intermediateRead,
  internalInconsistency,
  nameOf,
  observation,
  same,
  single,
} from "../../src/history/reads.js";
import type { Transaction } from "../../src/history/transaction.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Returns the facts of reads and appends, with no transaction and no aborted call. */
function factsOf(fields: Partial<Facts>): Facts {
  return {
    register: false,
    txns: [],
    reads: [],
    appender: new Map(),
    later: new Map(),
    aborted: new Set(),
    ...fields,
  };
}

/** Returns an ok transaction of call 0 of mops. */
function okTxn(...mops: Transaction["mops"]): Transaction {
  return {
    call: 0,
    completion: 1,
    kind: "ok",
    process: 0,
    args: [],
    output: undefined,
    mops,
  };
}

describe("reads", () => {
  describe("id", () => {
    it("returns the identity of a stated key or value", ({ seat }) => {
      check.isEqualTo(seat, id("x"), identityOf("x") as string, "the identity of x");
    });
  });

  describe("nameOf", () => {
    it("returns the identities of a key and a value as one name", ({ seat }) => {
      check.isEqualTo(
        seat,
        nameOf("x", 1n),
        JSON.stringify([identityOf("x"), identityOf(1n)]),
        "the two identities",
      );
    });
  });

  describe("observation", () => {
    it("returns the observation of the stated fields with the others empty", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        observation("garbage-read", { value: 9n }),
        {
          anomaly: "garbage-read",
          calls: [],
          key: undefined,
          reads: [],
          value: 9n,
          appender: undefined,
          next: undefined,
          expected: [],
          whole: false,
          future: undefined,
          hasFuture: false,
          register: false,
          read: undefined,
          known: undefined,
        },
        "one field stated",
      );
    });
  });

  describe("single", () => {
    it("returns an instance without a cycle and with one observation", ({ seat }) => {
      const evidence = observation("garbage-read", { calls: [0] });

      check.isEqualTo(
        seat,
        single("garbage-read", [0], evidence),
        {
          anomaly: "garbage-read",
          calls: [0],
          cycle: undefined,
          explanation: [evidence],
        },
        "the instance",
      );
    });
  });

  describe("garbageRead", () => {
    it("returns a read of a value that no call appended", ({ seat }) => {
      const reads = [{ call: 0, key: "x", read: [9n] }];

      check.isEqualTo(
        seat,
        garbageRead(factsOf({ reads }))?.explanation,
        [
          observation("garbage-read", {
            calls: [0],
            key: "x",
            reads: [[9n]],
            value: 9n,
          }),
        ],
        "the value 9",
      );
    });

    it("returns undefined for a read of appended values", ({ seat }) => {
      const reads = [{ call: 1, key: "x", read: [1n] }];
      const appender = new Map([[nameOf("x", 1n), 0]]);

      check.isNil(seat, garbageRead(factsOf({ reads, appender })), "no garbage");
    });
  });

  describe("duplicateAppend", () => {
    it("returns a read that returned a value twice", ({ seat }) => {
      const reads = [{ call: 0, key: "x", read: [1n, 1n] }];

      check.isEqualTo(
        seat,
        duplicateAppend(factsOf({ reads }))?.explanation,
        [
          observation("duplicate-append", {
            calls: [0],
            key: "x",
            reads: [[1n, 1n]],
            value: 1n,
          }),
        ],
        "the value 1",
      );
    });

    it("returns undefined for a read of distinct values", ({ seat }) => {
      const reads = [{ call: 0, key: "x", read: [1n, 2n] }];

      check.isNil(seat, duplicateAppend(factsOf({ reads })), "no duplicate");
    });
  });

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

  describe("same", () => {
    const tests: {
      name: string;
      give: readonly [readonly unknown[], readonly unknown[]];
      want: boolean;
    }[] = [
      { name: "two reads of the initial value", give: [[], []], want: true },
      { name: "two reads of one value", give: [[1n], [1n]], want: true },
      {
        name: "a read of a value and of the initial value",
        give: [[1n], []],
        want: false,
      },
      { name: "reads of two values", give: [[1n], [2n]], want: false },
    ];
    for (const tt of tests) {
      it(`reports ${String(tt.want)} for ${tt.name}`, ({ seat }) => {
        check.isEqualTo(seat, same(...tt.give), tt.want, "the comparison");
      });
    }
  });

  describe("abortedRead", () => {
    it("returns a read of a value that an aborted call appended", ({ seat }) => {
      const reads = [{ call: 1, key: "x", read: [1n] }];
      const appender = new Map([[nameOf("x", 1n), 0]]);

      check.isEqualTo(
        seat,
        abortedRead(factsOf({ reads, appender, aborted: new Set([0]) }))?.calls,
        [1, 0],
        "the reader and the appender",
      );
    });

    it("returns undefined for a read of committed appends", ({ seat }) => {
      const reads = [{ call: 1, key: "x", read: [1n] }];
      const appender = new Map([[nameOf("x", 1n), 0]]);

      check.isNil(seat, abortedRead(factsOf({ reads, appender })), "no aborted read");
    });
  });

  describe("intermediateRead", () => {
    it("returns a read that ends in an append that its appender followed with another", ({
      seat,
    }) => {
      const name = nameOf("x", 1n);
      const facts = factsOf({
        reads: [{ call: 1, key: "x", read: [1n] }],
        appender: new Map([[name, 0]]),
        later: new Map([[name, 2n]]),
      });

      check.isEqualTo(
        seat,
        intermediateRead(facts)?.explanation,
        [
          observation("intermediate-read", {
            calls: [1],
            key: "x",
            value: 1n,
            appender: 0,
            next: 2n,
          }),
        ],
        "the read of 1 before 2",
      );
    });

    it("returns undefined for a read of the transaction's own intermediate append", ({
      seat,
    }) => {
      const name = nameOf("x", 1n);
      const facts = factsOf({
        reads: [{ call: 0, key: "x", read: [1n] }],
        appender: new Map([[name, 0]]),
        later: new Map([[name, 2n]]),
      });

      check.isNil(seat, intermediateRead(facts), "its own append");
    });
  });
});
