/**
 * The spec of the isolation checks: the kinds that each level reports and
 * the record of a failure. Each verdict and each record is that of the
 * definition's reference implementation on the same history.
 */

import { describe } from "vitest";
import type { Edge } from "../../src/history/derivation.js";
import { History } from "../../src/history/history.js";
import {
  checkIsolation,
  evidenceJson,
  hasSnapshotIsolation,
  isolationJson,
  isSerializable,
  type Level,
  SERIALIZABLE,
  SNAPSHOT_ISOLATION,
} from "../../src/history/isolation.js";
import { check } from "../../src/index.js";
import { detail as literalOf } from "../../src/record/literal.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import {
  append,
  invokeTxn,
  Plain,
  readOf,
  readSkew,
  records,
  runTxn,
  thrown,
  writeSkew,
} from "../helpers.js";

/** Both levels. */
const LEVELS: readonly Level[] = [SERIALIZABLE, SNAPSHOT_ISOLATION];

/** Returns the anomaly that a check of history at level reports, and every kind it lists. */
function outcome(
  history: History,
  level: Level,
): [string, readonly string[]] | undefined {
  const detail = checkIsolation(history.events(), level);
  return detail === undefined ? undefined : [detail.anomaly, detail.kinds];
}

/** Returns the JSON of the detail of a failing check of history at level. */
function json(history: History, level: Level): Record<string, unknown> {
  return isolationJson(
    checkIsolation(history.events(), level) as NonNullable<
      ReturnType<typeof checkIsolation>
    >,
  );
}

describe("isolation", () => {
  describe("SERIALIZABLE", () => {
    it("is the id of the assertion of serializability", ({ seat }) => {
      check.equal(seat, SERIALIZABLE, "serializable", "the id");
    });
  });

  describe("SNAPSHOT_ISOLATION", () => {
    it("is the id of the assertion of snapshot isolation", ({ seat }) => {
      check.equal(seat, SNAPSHOT_ISOLATION, "snapshot-isolation", "the id");
    });
  });

  describe("checkIsolation", () => {
    it("passes a serial history at both levels", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1));
      runTxn(history, 1, readOf("x", [1]), append("x", 2));
      runTxn(history, 0, readOf("x", [1, 2]));

      check.equal(
        seat,
        LEVELS.map((level) => checkIsolation(history.events(), level)),
        [undefined, undefined],
        "no anomaly",
      );
    });

    it("passes an empty history", ({ seat }) => {
      check.isNil(seat, checkIsolation([], SERIALIZABLE), "no anomaly");
    });

    it("passes one value appended to two keys", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), append("y", 1));
      runTxn(history, 0, readOf("x", [1]), readOf("y", [1]));

      check.equal(
        seat,
        LEVELS.map((level) => checkIsolation(history.events(), level)),
        [undefined, undefined],
        "no anomaly",
      );
    });

    it("lists every kind that a read that differs from an earlier one shows", ({
      seat,
    }) => {
      const history = new History();
      const reader = invokeTxn(history, 0, readOf("x", null), readOf("x", null));
      runTxn(history, 1, append("x", 1));
      reader.ok([readOf("x", []), readOf("x", [1])]);

      check.equal(
        seat,
        outcome(history, SERIALIZABLE),
        ["internal-inconsistency", ["internal-inconsistency", "G-single", "G2"]],
        "three kinds",
      );
    });

    it("lists the cycles that an intermediate read closes", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), append("x", 2));
      runTxn(history, 1, readOf("x", [1]));

      check.equal(
        seat,
        outcome(history, SERIALIZABLE),
        ["intermediate-read", ["intermediate-read", "G-single", "G2"]],
        "an intermediate read and two cycles",
      );
    });

    it("reports a duplicate append at snapshot isolation", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1));
      runTxn(history, 1, readOf("x", [1, 1]));

      check.equal(
        seat,
        outcome(history, SNAPSHOT_ISOLATION),
        ["duplicate-append", ["duplicate-append"]],
        "one kind",
      );
    });

    it("lists G2 of a read skew at serializability alone", ({ seat }) => {
      const history = readSkew("ok", true);

      check.equal(
        seat,
        LEVELS.map((level) => outcome(history, level)),
        [
          ["G-single", ["G-single", "G2"]],
          ["G-single", ["G-single"]],
        ],
        "G2 is permitted under snapshot isolation",
      );
    });

    it("reports G2 of a write skew at serializability", ({ seat }) => {
      check.equal(
        seat,
        outcome(writeSkew(), SERIALIZABLE),
        ["G2", ["G2"]],
        "two adjacent rw edges",
      );
    });

    it("passes a write skew at snapshot isolation", ({ seat }) => {
      check.isNil(
        seat,
        outcome(writeSkew(), SNAPSHOT_ISOLATION),
        "snapshot isolation permits G2",
      );
    });

    it("reports a long fork at both levels", ({ seat }) => {
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
        LEVELS.map((level) => outcome(history, level)),
        [
          ["G-nonadjacent", ["G-nonadjacent", "G2"]],
          ["G-nonadjacent", ["G-nonadjacent"]],
        ],
        "G-nonadjacent at both levels",
      );
    });

    it("lists the transactions of an aborted read with their kinds", ({ seat }) => {
      const history = new History();
      invokeTxn(history, 0, append("x", 1)).fail("aborted");
      runTxn(history, 1, readOf("x", [1]));
      const detail = checkIsolation(history.events(), SNAPSHOT_ISOLATION);

      check.equal(
        seat,
        detail?.transactions.map((txn) => [txn.call, txn.kind]),
        [
          [2, "ok"],
          [0, "fail"],
        ],
        "the reader, then the appender",
      );
    });

    it("throws a TransactionError for a history of no transactions", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);

      check.equal(
        seat,
        thrown(() => checkIsolation(history.events(), SERIALIZABLE)),
        'call 0 is "write", not "txn"',
        "the refusal",
      );
    });
  });

  describe("isolationJson", () => {
    it("returns the record of a read skew with the whole evidence", ({ seat }) => {
      const history = readSkew("ok", true);
      const events = history.events() as readonly {
        args?: unknown[];
        output?: unknown;
      }[];

      check.equal(
        seat,
        json(history, SERIALIZABLE),
        {
          anomaly: "G-single",
          kinds: ["G-single", "G2"],
          transactions: [
            {
              call: 0,
              completion: 3,
              kind: "ok",
              process: 0,
              args: (events[0]?.args ?? []).map(literalOf),
              output: literalOf(events[3]?.output),
            },
            {
              call: 1,
              completion: 2,
              kind: "ok",
              process: 1,
              args: (events[1]?.args ?? []).map(literalOf),
              output: literalOf(events[2]?.output),
            },
          ],
          cycle: [
            { call: 0, relations: ["rw"] },
            { call: 1, relations: ["wr"] },
          ],
          explanation: [
            {
              from: 0,
              to: 1,
              relation: "rw",
              key: literalOf("x"),
              value: null,
              next: literalOf(1),
            },
            {
              from: 1,
              to: 0,
              relation: "wr",
              key: literalOf("y"),
              value: literalOf(2),
            },
          ],
        },
        "the record",
      );
    });

    it("returns the explanation of a garbage read", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, readOf("x", [9]));

      check.equal(
        seat,
        [
          json(history, SERIALIZABLE)["cycle"],
          json(history, SERIALIZABLE)["explanation"],
        ],
        [
          null,
          [{ call: 0, key: literalOf("x"), read: literalOf([9]), value: literalOf(9) }],
        ],
        "the read of 9",
      );
    });

    it("returns the explanation of an internal inconsistency without a future", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1));
      runTxn(history, 1, append("x", 2), readOf("x", [1]));

      check.equal(
        seat,
        json(history, SERIALIZABLE)["explanation"],
        [
          {
            call: 2,
            key: literalOf("x"),
            read: literalOf([1]),
            expected: literalOf([2]),
            whole: false,
            future: null,
          },
        ],
        "the list ends with 2",
      );
    });

    it("returns the explanation of an internal inconsistency with a future", ({
      seat,
    }) => {
      const history = new History();
      runTxn(history, 0, readOf("x", [1]), append("x", 1));

      check.equal(
        seat,
        json(history, SNAPSHOT_ISOLATION)["explanation"],
        [
          {
            call: 0,
            key: literalOf("x"),
            read: literalOf([1]),
            expected: literalOf([]),
            whole: false,
            future: literalOf(1),
          },
        ],
        "1 follows the read",
      );
    });

    it("returns the explanation of an incompatible order", ({ seat }) => {
      const history = new History();
      for (const value of [1, 2, 3]) runTxn(history, value, append("x", value));
      runTxn(history, 0, readOf("x", [1, 2]));
      runTxn(history, 0, readOf("x", [1, 3]));

      check.equal(
        seat,
        json(history, SERIALIZABLE)["explanation"],
        [
          {
            calls: [6, 8],
            key: literalOf("x"),
            reads: [literalOf([1, 2]), literalOf([1, 3])],
          },
        ],
        "two reads",
      );
    });

    it("returns the explanation of an aborted read", ({ seat }) => {
      const history = new History();
      invokeTxn(history, 0, append("x", 1)).fail("aborted");
      runTxn(history, 1, readOf("x", [1]));

      check.equal(
        seat,
        json(history, SNAPSHOT_ISOLATION)["explanation"],
        [{ call: 2, key: literalOf("x"), value: literalOf(1), appender: 0 }],
        "the read of 1",
      );
    });

    it("returns the explanation of an intermediate read", ({ seat }) => {
      const history = new History();
      runTxn(history, 0, append("x", 1), append("x", 2));
      runTxn(history, 1, readOf("x", [1]));

      check.equal(
        seat,
        json(history, SERIALIZABLE)["explanation"],
        [
          {
            call: 2,
            key: literalOf("x"),
            value: literalOf(1),
            appender: 0,
            next: literalOf(2),
          },
        ],
        "1 is followed by 2",
      );
    });
  });

  describe("evidenceJson", () => {
    const tests: { name: string; give: Edge; want: Record<string, unknown> }[] = [
      {
        name: "a ww edge with both values",
        give: {
          from: 0,
          to: 1,
          relation: "ww",
          key: "x",
          value: 1,
          empty: false,
          next: 2,
        },
        want: {
          from: 0,
          to: 1,
          relation: "ww",
          key: literalOf("x"),
          value: literalOf(1),
          next: literalOf(2),
        },
      },
      {
        name: "a wr edge without a next value",
        give: {
          from: 1,
          to: 0,
          relation: "wr",
          key: "y",
          value: 2,
          empty: false,
          next: undefined,
        },
        want: {
          from: 1,
          to: 0,
          relation: "wr",
          key: literalOf("y"),
          value: literalOf(2),
        },
      },
      {
        name: "an rw edge of an empty read with a null value",
        give: {
          from: 0,
          to: 1,
          relation: "rw",
          key: "x",
          value: undefined,
          empty: true,
          next: 1,
        },
        want: {
          from: 0,
          to: 1,
          relation: "rw",
          key: literalOf("x"),
          value: null,
          next: literalOf(1),
        },
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, evidenceJson(tt.give), tt.want, "the entry");
      });
    }
  });

  const assertions: {
    name: string;
    give: typeof isSerializable;
    id: string;
    op: string;
  }[] = [
    {
      name: "isSerializable",
      give: isSerializable,
      id: SERIALIZABLE,
      op: "history.isSerializable",
    },
    {
      name: "hasSnapshotIsolation",
      give: hasSnapshotIsolation,
      id: SNAPSHOT_ISOLATION,
      op: "history.hasSnapshotIsolation",
    },
  ];
  for (const tt of assertions) {
    describe(tt.name, () => {
      it("records a pass for a serial history", ({ seat }) => {
        const history = new History();
        runTxn(history, 0, append("x", 1));
        runTxn(history, 1, readOf("x", [1]));
        const recorder = new Recorder();
        tt.give(recorder, history, "the store is isolated");

        check.equal(
          seat,
          [recorder.failures, records(recorder)[0]?.["verdict"]],
          [[], "pass"],
          "a pass",
        );
      });

      it(`fails with one record of ${tt.id} at its call`, ({ seat }) => {
        const history = readSkew("ok", true);
        const recorder = new Recorder();
        tt.give(recorder, history, "the store is isolated");
        const [failure] = recorder.failures;

        check.equal(
          seat,
          [
            failure?.assertion,
            failure?.contract,
            Object.keys(failure?.detail ?? {}),
            records(recorder)[0]?.["detail"],
          ],
          [
            tt.id,
            "the store is isolated",
            ["anomaly", "kinds", "transactions", "cycle", "explanation"],
            json(history, tt.id as Level),
          ],
          "the record and its call record",
        );
        check.hasSuffix(
          seat,
          failure?.where?.file,
          "isolation.test.ts",
          "the call site",
        );
      });

      it("sends the sentence of the record to a seat without records", ({ seat }) => {
        const plain = new Plain();
        tt.give(plain, readSkew("ok", true), "the store is isolated");

        check.hasPrefix(
          seat,
          plain.received[0]?.[1],
          "the store is isolated: G-single",
          "the sentence",
        );
      });

      it("ends the call with a fault for a history that is no History", ({ seat }) => {
        const recorder = new Recorder();
        tt.give(recorder, {} as History, "c");

        check.equal(
          seat,
          recorder.message,
          `${tt.op}: the history is no History`,
          "the fault",
        );
      });

      it("ends the call with a fault for a history of no transactions", ({ seat }) => {
        const history = new History();
        history.invoke(0, "write", [1], "x").ok(null);
        const recorder = new Recorder();
        tt.give(recorder, history, "c");

        check.equal(
          seat,
          recorder.message,
          `${tt.op}: call 0 is "write", not "txn"`,
          "the fault",
        );
      });
    });
  }
});
