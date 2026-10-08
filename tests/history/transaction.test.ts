/**
 * The spec of the transactions of a history of list appends: the
 * workload's contract, and the histories that it refuses, as the
 * definition's reference implementation refuses them.
 */

import { describe } from "vitest";
import { History } from "../../src/history/history.js";
import {
  APPEND,
  identity,
  READ,
  TransactionError,
  TXN,
  transactionJson,
  transactions,
} from "../../src/history/transaction.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { append, invokeTxn, readOf, runTxn, thrown } from "../helpers.js";

/** Returns the message of the TransactionError that transactions throws for history, or the empty string. */
function refusal(history: History): string {
  try {
    transactions(history.events());
  } catch (err) {
    if (err instanceof TransactionError) return err.message;
    throw err;
  }
  return "";
}

describe("transaction", () => {
  it("names the operation and the functions of the workload", ({ seat }) => {
    check.equal(seat, [TXN, APPEND, READ], ["txn", "append", "read"], "the names");
  });

  describe("new TransactionError", () => {
    it("returns an error of its message", ({ seat }) => {
      const err = new TransactionError("call 0 is no transaction");

      check.equal(
        seat,
        [err.name, err.message],
        ["TransactionError", "call 0 is no transaction"],
        "the name and the message",
      );
    });
  });

  describe("identity", () => {
    it("returns the identity of a value", ({ seat }) => {
      check.equal(
        seat,
        identity(0, "x"),
        '{"type":"string","value":"x"}',
        "the JSON text of the typed literal of x",
      );
    });

    it("throws a TransactionError for a value that no typed literal states", ({
      seat,
    }) => {
      check.equal(
        seat,
        thrown(() => identity(3, Symbol.for("v"))),
        "call 3 states Symbol(v), which no typed literal states",
        "the refusal",
      );
    });
  });

  describe("transactions", () => {
    it("returns the transactions in the order of their invocations", ({ seat }) => {
      const history = new History();
      const pending = invokeTxn(history, 0, append("x", 1));
      runTxn(history, 1, readOf("x", []));
      pending.fail("aborted");

      check.equal(
        seat,
        transactions(history.events()).map((txn) => [
          txn.call,
          txn.completion,
          txn.kind,
        ]),
        [
          [0, 3, "fail"],
          [1, 2, "ok"],
        ],
        "two transactions",
      );
    });

    it("returns the micro-operations of an ok output with each read's list", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), readOf("x", [1]));

      check.equal(
        seat,
        transactions(history.events())[0]?.mops,
        [
          { fn: "append", key: "x", value: 1 },
          { fn: "read", key: "x", value: [1] },
        ],
        "the append and the read",
      );
    });

    it("returns the micro-operations of the invocation of a call that did not commit", ({
      seat,
    }) => {
      const history = new History();
      invokeTxn(history, 0, readOf("x", null)).unknown("timed out");

      check.equal(
        seat,
        transactions(history.events())[0]?.mops,
        [{ fn: "read", key: "x", value: undefined }],
        "a read without a list",
      );
    });

    it("reads a read that returned null as a read of the empty list", ({ seat }) => {
      const history = new History();
      invokeTxn(history, 0, readOf("x", null)).ok([readOf("x", null)]);

      check.equal(
        seat,
        transactions(history.events())[0]?.mops[0]?.value,
        [],
        "the empty list",
      );
    });

    it("accepts one value appended to two keys", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), append("y", 1));

      check.equal(seat, refusal(history), "", "no refusal");
    });

    const tests: { name: string; give: (history: History) => void; want: string }[] = [
      {
        name: "a call that is no transaction",
        give: (history) => history.invoke(0, "write", [1], "x").ok(null),
        want: 'call 0 is "write", not "txn"',
      },
      {
        name: "an argument that is no micro-operation",
        give: (history) => {
          history.invoke(0, TXN, [[APPEND, "x"]], "x");
        },
        want: 'argument 0 of call 0 is ["append", "x"], not [append, key, value] or [read, key, null]',
      },
      {
        name: "a read that states a list before it ran",
        give: (history) => {
          history.invoke(0, TXN, [readOf("x", [1])], "x");
        },
        want: "the read at argument 0 of call 0 states a list before it ran",
      },
      {
        name: "an output that repeats another value",
        give: (history) => invokeTxn(history, 0, append("x", 1)).ok([append("x", 2)]),
        want: 'micro-operation 0 of the output of call 0 is ["append", "x", 2], which does not repeat ["append", "x", 1]',
      },
      {
        name: "an output that repeats a read as an append",
        give: (history) =>
          invokeTxn(history, 0, readOf("x", null)).ok([append("x", 1)]),
        want: 'micro-operation 0 of the output of call 0 is ["append", "x", 1], which does not repeat ["read", "x", null]',
      },
      {
        name: "an output of another number of micro-operations",
        give: (history) =>
          invokeTxn(history, 0, append("x", 1)).ok([append("x", 1), readOf("x", [1])]),
        want: "the output of call 0 does not repeat the micro-operations of its invocation",
      },
      {
        name: "an output that is no list",
        give: (history) => invokeTxn(history, 0, append("x", 1)).ok(7),
        want: "the output of call 0 does not repeat the micro-operations of its invocation",
      },
      {
        name: "a read that returned no list",
        give: (history) =>
          invokeTxn(history, 0, readOf("x", null)).ok([readOf("x", 5)]),
        want: "the read at micro-operation 0 of the output of call 0 returned 5, not a list",
      },
      {
        name: "a value that two calls append to one key",
        give: (history) => {
          runTxn(history, 0, append("x", 1));
          runTxn(history, 0, append("x", 1));
        },
        want: 'calls 0 and 2 both append 1 to the key "x"',
      },
      {
        name: "a value that one call appends to one key twice",
        give: (history) => runTxn(history, 0, append("x", 1), append("x", 1)),
        want: 'call 0 appends 1 to the key "x" twice',
      },
      {
        name: "a key that no typed literal states",
        give: (history) => {
          history.invoke(0, TXN, [readOf(Symbol.for("k"), null)]);
        },
        want: "call 0 states Symbol(k), which no typed literal states",
      },
    ];
    for (const tt of tests) {
      it(`throws a TransactionError for ${tt.name}`, ({ seat }) => {
        const history = new History();
        tt.give(history);

        check.equal(seat, refusal(history), tt.want, "the refusal");
      });
    }
  });

  describe("transactionJson", () => {
    it("returns an ok transaction with its completion, its kind and its output", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, readOf("x", [9]));
      const [txn] = transactions(history.events());

      check.equal(
        seat,
        transactionJson(txn as NonNullable<typeof txn>),
        {
          call: 0,
          completion: 1,
          kind: "ok",
          process: 0,
          args: [
            {
              type: "list",
              items: [
                { type: "string", value: "read" },
                { type: "string", value: "x" },
                { type: "null" },
              ],
            },
          ],
          output: {
            type: "list",
            items: [
              {
                type: "list",
                items: [
                  { type: "string", value: "read" },
                  { type: "string", value: "x" },
                  { type: "list", of: "int", value: [9] },
                ],
              },
            ],
          },
        },
        "the history's JSON form",
      );
    });

    it("returns a pending transaction without a completion and an output", ({
      seat,
    }) => {
      const history = new History();
      invokeTxn(history, 0, append("x", 1));
      const [txn] = transactions(history.events());

      check.equal(
        seat,
        Object.keys(transactionJson(txn as NonNullable<typeof txn>)),
        ["call", "process", "args"],
        "the invocation alone",
      );
    });

    it("returns a failed transaction with its kind and without an output", ({
      seat,
    }) => {
      const history = new History();
      invokeTxn(history, 0, append("x", 1)).fail("aborted");
      const [txn] = transactions(history.events());

      check.equal(
        seat,
        Object.keys(transactionJson(txn as NonNullable<typeof txn>)),
        ["call", "completion", "kind", "process", "args"],
        "no output",
      );
    });
  });
});
