// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the anomalies that the reads of a history show without a cycle. */

import { describe } from "vitest";
import { identityOf } from "../../src/history/history.js";
import {
  abortedRead,
  add,
  duplicateAppend,
  firstReads,
  garbageRead,
  id,
  intermediateRead,
  lostUpdate,
  nameOf,
  observation,
  same,
  single,
} from "../../src/history/reads.js";
import type { Transaction } from "../../src/history/transaction.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { factsOf, okTxn } from "../helpers.js";

describe("reads", () => {
  describe("add", () => {
    it("appends each value to the list of its key", ({ seat }) => {
      const map = new Map<string, number[]>();
      add(map, "x", 1);
      add(map, "y", 2);
      add(map, "x", 3);

      check.isEqualTo(
        seat,
        map,
        new Map([
          ["x", [1, 3]],
          ["y", [2]],
        ]),
        "x has two values",
      );
    });
  });

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

  describe("firstReads", () => {
    it("returns each read that is the first micro-operation on its key", ({ seat }) => {
      const txn = okTxn(
        { fn: "read", key: "x", value: [1n] },
        { fn: "append", key: "y", value: 2n },
        { fn: "read", key: "y", value: [2n] },
        { fn: "read", key: "x", value: [1n] },
        { fn: "read", key: "z", value: [] },
      );

      check.isEqualTo(
        seat,
        firstReads(txn),
        [
          { fn: "read", key: "x", value: [1n] },
          { fn: "read", key: "z", value: [] },
        ],
        "the first reads of x and z",
      );
    });
  });

  describe("lostUpdate", () => {
    it("returns two calls that read one list of a key and both append to it", ({
      seat,
    }) => {
      const facts = factsOf({
        txns: [
          { ...okTxn({ fn: "append", key: "x", value: 1n }), call: 0 },
          {
            ...okTxn(
              { fn: "read", key: "x", value: [1n] },
              { fn: "append", key: "x", value: 2n },
            ),
            call: 2,
          },
          {
            ...okTxn(
              { fn: "read", key: "x", value: [1n] },
              { fn: "append", key: "x", value: 3n },
            ),
            call: 4,
          },
        ],
      });

      check.isEqualTo(
        seat,
        lostUpdate(facts),
        single(
          "lost-update",
          [2, 4],
          observation("lost-update", { calls: [2, 4], key: "x", reads: [[1n]] }),
        ),
        "the two calls and their read",
      );
    });

    it("returns the value of the two reads of a register", ({ seat }) => {
      const facts = factsOf({
        register: true,
        txns: [0, 2].map((call) => ({
          ...okTxn(
            { fn: "read", key: "x", value: [1n] },
            { fn: "write", key: "x", value: BigInt(call + 2) },
          ),
          call,
        })),
      });

      check.isEqualTo(
        seat,
        lostUpdate(facts)?.explanation,
        [
          observation("lost-update", {
            calls: [0, 2],
            key: "x",
            reads: [[1n]],
            register: true,
            read: 1n,
          }),
        ],
        "the value 1",
      );
    });

    const tests: { name: string; give: readonly Transaction[] }[] = [
      {
        name: "two reads of a key that one of the calls does not append to",
        give: [
          {
            ...okTxn(
              { fn: "read", key: "x", value: [] },
              { fn: "append", key: "x", value: 1n },
            ),
            call: 0,
          },
          {
            ...okTxn(
              { fn: "read", key: "x", value: [] },
              { fn: "append", key: "y", value: 2n },
            ),
            call: 2,
          },
        ],
      },
      {
        name: "two reads of different lists",
        give: [
          {
            ...okTxn(
              { fn: "read", key: "x", value: [] },
              { fn: "append", key: "x", value: 1n },
            ),
            call: 0,
          },
          {
            ...okTxn(
              { fn: "read", key: "x", value: [1n] },
              { fn: "append", key: "x", value: 2n },
            ),
            call: 2,
          },
        ],
      },
      {
        name: "a call that did not commit",
        give: [
          {
            ...okTxn(
              { fn: "read", key: "x", value: [] },
              { fn: "append", key: "x", value: 1n },
            ),
            call: 0,
          },
          {
            ...okTxn(
              { fn: "read", key: "x", value: [] },
              { fn: "append", key: "x", value: 2n },
            ),
            call: 2,
            kind: "fail",
          },
        ],
      },
    ];
    for (const tt of tests) {
      it(`returns undefined for ${tt.name}`, ({ seat }) => {
        check.isNil(seat, lostUpdate(factsOf({ txns: tt.give })), "no lost update");
      });
    }
  });
});
