// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the sentences of the records of the history checks. */

import { describe } from "vitest";
import { Failure } from "../../src/failure.js";
import type {
  Anomaly,
  Edge,
  Evidence,
  Observation,
} from "../../src/history/anomaly.js";
import { History } from "../../src/history/history.js";
import { check as checked, fieldsOf } from "../../src/history/linearizable.js";
import { budget } from "../../src/history/option.js";
import { isolationSentence, sentence } from "../../src/history/sentence.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { REGISTER } from "../helpers.js";

/** Returns the record of the check of history against the register, under options. */
function recordOf(
  history: History,
  ...options: Parameters<typeof budget>[0][]
): Failure {
  const detail = checked(history, REGISTER, options.map(budget));
  return new Failure("linearizable", "c", fieldsOf(detail));
}

/** Returns the record of an isolation check whose explanation is explanation. */
function isolated(anomaly: Anomaly, explanation: readonly Evidence[]): Failure {
  return new Failure("serializable", "c", {
    anomaly,
    kinds: [anomaly, "G2"],
    transactions: [],
    cycle: null,
    explanation,
  });
}

/** Returns the observation of an anomaly of fields, with the other fields empty. */
function observed(anomaly: Anomaly, fields: Partial<Observation>): Observation {
  return {
    anomaly,
    calls: [0],
    key: "x",
    reads: [],
    value: undefined,
    appender: undefined,
    next: undefined,
    expected: [],
    whole: false,
    future: undefined,
    hasFuture: false,
    register: false,
    read: undefined,
    known: undefined,
    ...fields,
  };
}

/** A cycle with one edge of each relation and a second rw edge, whose first rw edge is empty. */
const CYCLE: readonly Edge[] = [
  {
    from: 0,
    to: 1,
    relation: "ww",
    key: "x",
    value: 1,
    empty: false,
    next: 2,
    register: false,
  },
  {
    from: 1,
    to: 2,
    relation: "wr",
    key: "y",
    value: 3,
    empty: false,
    next: undefined,
    register: false,
  },
  {
    from: 2,
    to: 3,
    relation: "rw",
    key: "z",
    value: undefined,
    empty: true,
    next: 4,
    register: false,
  },
  {
    from: 3,
    to: 0,
    relation: "rw",
    key: "z",
    value: 5,
    empty: false,
    next: 6,
    register: false,
  },
];

describe("sentence", () => {
  describe("sentence", () => {
    it("states the frontier of a violated partition", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(null);

      check.isEqualTo(
        seat,
        sentence(recordOf(history)),
        [
          'c: violated in the partition of "x"',
          "    steps 2, partitions 1, calls 2, concurrency 1",
          "    linearized: call 0 write(1) → null",
          "    states: 1",
          "    rejected: call 2 read() → null",
        ].join("\n"),
        "the sentence",
      );
    });

    it("states the limit of an undecided partition of every key", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1]).ok(null);
      history.invoke(1, "read", []).ok(1);

      check.isEqualTo(
        seat,
        sentence(recordOf(history, 1)),
        [
          "c: undecided in the partition of every key, at the steps limit",
          "    steps 1, partitions 1, calls 2, concurrency 1",
          "    linearized: call 0 write(1) → null",
          "    states: 1",
          "    rejected: none",
        ].join("\n"),
        "the sentence",
      );
    });

    it("states a call whose outcome is unknown", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1]).unknown("lost");
      history.invoke(1, "read", []).ok(9);

      check.isEqualTo(
        seat,
        sentence(recordOf(history)),
        [
          "c: violated in the partition of every key",
          "    steps 3, partitions 1, calls 2, concurrency 2",
          "    linearized: call 0 write(1), outcome unknown",
          "    states: 1",
          "    rejected: call 2 read() → 9",
        ].join("\n"),
        "the sentence",
      );
    });
  });

  describe("isolationSentence", () => {
    it("states the anomaly, the kinds and each edge of a cycle", ({ seat }) => {
      const record = isolated("G0", CYCLE);

      check.isEqualTo(
        seat,
        isolationSentence(record),
        [
          "c: G0",
          "    kinds: G0, G2",
          '    call 0 -ww-> call 1: call 1 appended 2 to "x" after 1',
          '    call 1 -wr-> call 2: call 2 read "y" ending in 3',
          '    call 2 -rw-> call 3: call 2 read [] from "z", and call 3 appended 4 to it',
          '    call 3 -rw-> call 0: call 3 read "z" ending in 5, and call 0 appended 6 after it',
        ].join("\n"),
        "the sentence",
      );
    });

    it("states each edge of a register cycle", ({ seat }) => {
      const record = isolated(
        "G0",
        CYCLE.map((edge) => ({ ...edge, register: true })),
      );

      check.isEqualTo(
        seat,
        isolationSentence(record),
        [
          "c: G0",
          "    kinds: G0, G2",
          '    call 0 -ww-> call 1: call 1 wrote 2 to "x" after 1',
          '    call 1 -wr-> call 2: call 2 read 3 from "y"',
          '    call 2 -rw-> call 3: call 2 read the initial value of "z", and call 3 wrote 4 to it',
          '    call 3 -rw-> call 0: call 3 read 5 from "z", and call 0 wrote 6 after it',
        ].join("\n"),
        "the sentence",
      );
    });

    const tests: { name: string; give: Observation; want: string }[] = [
      {
        name: "a garbage read of a register",
        give: observed("garbage-read", { value: 9, register: true, read: 9 }),
        want: 'call 0 read 9 from "x", and no transaction wrote it',
      },
      {
        name: "a register read that contradicts the known value",
        give: observed("internal-inconsistency", {
          register: true,
          read: 1,
          known: 2,
          whole: true,
        }),
        want: 'call 0 read 1 from "x", and it knew the value was 2',
      },
      {
        name: "a register read of the initial value after a write",
        give: observed("internal-inconsistency", {
          register: true,
          known: 2,
          whole: true,
        }),
        want: 'call 0 read the initial value from "x", and it knew the value was 2',
      },
      {
        name: "a register read of a later write",
        give: observed("internal-inconsistency", {
          register: true,
          read: 1,
          future: 1,
          hasFuture: true,
        }),
        want: 'call 0 read 1 from "x", and 1 is a value that call 0 writes later',
      },
      {
        name: "an aborted read of a register",
        give: observed("aborted-read", {
          calls: [2],
          value: 1,
          appender: 0,
          register: true,
        }),
        want: 'call 2 read 1 from "x", which call 0 wrote and aborted',
      },
      {
        name: "an intermediate read of a register",
        give: observed("intermediate-read", {
          calls: [2],
          value: 1,
          appender: 0,
          next: 2,
          register: true,
        }),
        want: 'call 2 read 1 from "x", which call 0 followed with 2',
      },
      {
        name: "a garbage read",
        give: observed("garbage-read", { reads: [[9]], value: 9 }),
        want: 'call 0 read [9] from "x", and no transaction appended 9',
      },
      {
        name: "a duplicate append",
        give: observed("duplicate-append", { reads: [[1, 1]], value: 1 }),
        want: 'call 0 read [1, 1] from "x", which contains 1 twice',
      },
      {
        name: "a read that contradicts the whole list",
        give: observed("internal-inconsistency", { reads: [[1]], whole: true }),
        want: 'call 0 read [1] from "x", and it knew the list was []',
      },
      {
        name: "a read that contradicts the end of the list",
        give: observed("internal-inconsistency", { reads: [[1]], expected: [2] }),
        want: 'call 0 read [1] from "x", and it knew the list ended with [2]',
      },
      {
        name: "a read of a later append",
        give: observed("internal-inconsistency", {
          reads: [[1]],
          future: 1,
          hasFuture: true,
        }),
        want: 'call 0 read [1] from "x", and 1 is a value that call 0 appends later',
      },
      {
        name: "an incompatible order",
        give: observed("incompatible-order", {
          calls: [6, 8],
          reads: [
            [1, 2],
            [1, 3],
          ],
        }),
        want: 'calls 6 and 8 read [1, 2] and [1, 3] from "x", and neither is a prefix of the other',
      },
      {
        name: "an aborted read",
        give: observed("aborted-read", { calls: [2], value: 1, appender: 0 }),
        want: 'call 2 read 1 from "x", which call 0 appended and aborted',
      },
      {
        name: "an intermediate read",
        give: observed("intermediate-read", {
          calls: [2],
          value: 1,
          appender: 0,
          next: 2,
        }),
        want: 'call 2 read "x" ending in 1, which call 0 followed with 2',
      },
    ];
    for (const tt of tests) {
      it(`states the observation of ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          isolationSentence(isolated(tt.give.anomaly, [tt.give])),
          `c: ${tt.give.anomaly}\n    kinds: ${tt.give.anomaly}, G2\n    ${tt.want}`,
          "the sentence",
        );
      });
    }
  });
});
