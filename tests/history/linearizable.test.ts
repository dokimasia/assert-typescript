/**
 * The spec of the check of linearizability: its partitions, its limits and
 * the record that it reports. Each outcome, each count of steps and each
 * record is the result of the definition's reference implementation on the
 * same history and spec.
 */

import { describe, onTestFinished, vi } from "vitest";
import type { Call } from "../../src/history/history.js";
import { History } from "../../src/history/history.js";
import {
  check as checked,
  type Detail,
  detailJson,
  fieldsOf,
  isLinearizable,
  LINEARIZABLE,
  whole,
} from "../../src/history/linearizable.js";
import { budget, memoLimit, timeLimit, workers } from "../../src/history/option.js";
import { SpecError } from "../../src/history/search.js";
import type { Operation, Spec } from "../../src/history/spec.js";
import { check } from "../../src/index.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { Plain, REGISTER, records } from "../helpers.js";

/** The typed literal of null. */
const NULL = { type: "null" };

/** Returns the typed literal of an int or a string. */
function literal(value: number | string): Record<string, unknown> {
  return { type: typeof value === "number" ? "int" : "string", value };
}

/** Invokes a write of value by client, on the key x unless keys are given. */
function write(
  history: History,
  client: number,
  value: unknown,
  ...keys: unknown[]
): Call {
  return history.invoke(client, "write", [value], ...(keys.length > 0 ? keys : ["x"]));
}

/** Invokes a read by client, on the key x unless keys are given. */
function read(history: History, client: number, ...keys: unknown[]): Call {
  return history.invoke(client, "read", [], ...(keys.length > 0 ? keys : ["x"]));
}

/** Returns the calls of spans, by their invocations. */
function callsOf(spans: Detail<unknown>["linearized"]): number[] {
  return spans.map((span) => span.call);
}

/** Returns a history whose partition x needs two steps, and y one. */
function twoPartitions(): History {
  const history = new History();
  write(history, 0, 1).ok(null);
  read(history, 1).ok(1);
  read(history, 2, "y").ok(null);
  return history;
}

describe("linearizable", () => {
  describe("LINEARIZABLE", () => {
    it("is the id of the assertion", ({ seat }) => {
      check.equal(seat, LINEARIZABLE, "linearizable", "the id");
    });
  });

  describe("check", () => {
    it("returns the frontier of a read that misses a completed write", ({ seat }) => {
      const history = new History();
      write(history, 0, 1).ok(null);
      read(history, 1).ok(null);

      check.equal(
        seat,
        detailJson(checked(history, REGISTER, [])),
        {
          outcome: "violated",
          partitions: 1,
          steps: 2,
          partition: [literal("x")],
          calls: 2,
          concurrency: 1,
          linearized: [
            {
              call: 0,
              completion: 1,
              process: 0,
              operation: "write",
              args: [literal(1)],
              output: NULL,
            },
          ],
          states: [literal(1)],
          candidates: [
            {
              call: 2,
              completion: 3,
              process: 1,
              operation: "read",
              args: [],
              output: NULL,
            },
          ],
          limit: null,
        },
        "the write is the frontier, and the read its one candidate",
      );
    });

    it("returns no reported partition for a pass", ({ seat }) => {
      const history = new History();
      write(history, 0, 1).ok(null);
      read(history, 1).ok(1);

      check.equal(
        seat,
        checked(history, REGISTER, []),
        {
          outcome: "passed",
          partitions: 1,
          steps: 2,
          partition: [],
          calls: 0,
          concurrency: 0,
          linearized: [],
          states: [],
          candidates: [],
          limit: undefined,
        },
        "the counts alone",
      );
    });

    it("passes a history without calls in no partition", ({ seat }) => {
      const history = new History();
      const empty = checked(history, REGISTER, []);
      write(history, 0, 1).fail("refused");
      const failed = checked(history, REGISTER, []);

      check.equal(
        seat,
        [empty.partitions, failed.outcome, failed.partitions, failed.steps],
        [0, "passed", 0, 0],
        "no partition",
      );
    });

    it("passes a failed call that joins no partition", ({ seat }) => {
      const history = new History();
      write(history, 0, 5, "x", "y").fail("refused");
      read(history, 1, "x").ok(null);
      read(history, 2, "y").ok(null);
      const detail = checked(history, REGISTER, []);

      check.equal(
        seat,
        [detail.outcome, detail.partitions, detail.steps],
        ["passed", 2, 2],
        "x and y apart",
      );
    });

    it("states no completion of a pending call and no output of an unknown one", ({
      seat,
    }) => {
      const history = new History();
      write(history, 0, 1);
      write(history, 1, 2).unknown("timed out");
      read(history, 2).ok(9);
      const detail = checked(history, REGISTER, []);

      check.equal(
        seat,
        [
          detail.outcome,
          detail.steps,
          detail.calls,
          detail.concurrency,
          detailJson(detail)["linearized"],
          detail.states,
          callsOf(detail.candidates),
        ],
        [
          "violated",
          9,
          3,
          3,
          [
            { call: 0, process: 0, operation: "write", args: [literal(1)] },
            {
              call: 1,
              completion: 2,
              process: 1,
              operation: "write",
              args: [literal(2)],
            },
          ],
          [2],
          [3],
        ],
        "the frontier of the two writes",
      );
    });

    it("reports the first violated partition in the order of first invocation", ({
      seat,
    }) => {
      const history = new History();
      write(history, 0, 1, "y").ok(null);
      read(history, 1, "x").ok(5);
      read(history, 2, "y").ok(1);
      const detail = checked(history, REGISTER, []);

      check.equal(
        seat,
        [
          detail.outcome,
          detail.partitions,
          detail.steps,
          detail.partition,
          callsOf(detail.linearized),
          detail.states,
          callsOf(detail.candidates),
        ],
        ["violated", 2, 3, ["x"], [], [null], [2]],
        "y passes, then x fails at its start",
      );
    });

    it("joins the partitions of the keys of one call", ({ seat }) => {
      const history = new History();
      read(history, 0, "x").ok(null);
      write(history, 1, 2, "y", "x").ok(null);
      read(history, 2, "y").ok(3);
      const detail = checked(history, REGISTER, []);

      check.equal(
        seat,
        [
          detail.partition,
          detail.partitions,
          detail.calls,
          detail.steps,
          callsOf(detail.linearized),
          detail.states,
        ],
        [["x", "y"], 1, 3, 3, [0, 2], [2]],
        "one partition of x and y",
      );
    });

    it("puts every call in one partition for a call that declares no key", ({
      seat,
    }) => {
      const history = new History();
      write(history, 0, 1, "x").ok(null);
      history.invoke(1, "read", []).ok(2);
      write(history, 2, 1, "y").ok(null);
      const detail = checked(history, REGISTER, []);

      check.equal(
        seat,
        [detail.partitions, detail.partition, detail.calls],
        [1, [], 3],
        "one partition of every key",
      );
    });

    it("puts two maps of equal entries in one partition", ({ seat }) => {
      const history = new History();
      write(
        history,
        0,
        1,
        new Map([
          [1, "a"],
          [2, "b"],
        ]),
      ).ok(null);
      read(
        history,
        1,
        new Map([
          [2, "b"],
          [1, "a"],
        ]),
      ).ok(1);

      check.equal(seat, checked(history, REGISTER, []).partitions, 1, "one key");
    });

    it("passes within a budget that its steps spend exactly", ({ seat }) => {
      const detail = checked(twoPartitions(), REGISTER, [budget(2)]);

      check.equal(
        seat,
        [detail.outcome, detail.steps],
        ["passed", 3],
        "two steps of x",
      );
    });

    it("stops before a step past its budget", ({ seat }) => {
      const detail = checked(twoPartitions(), REGISTER, [budget(1)]);

      check.equal(
        seat,
        [
          detail.outcome,
          detail.partitions,
          detail.steps,
          detail.partition,
          detail.limit,
          callsOf(detail.linearized),
          detail.states,
          detail.candidates,
        ],
        ["undecided", 2, 1, ["x"], "steps", [0], [1], []],
        "x stops after one step, and the step of y is not counted",
      );
    });

    it("reports a violated partition after an undecided one", ({ seat }) => {
      const history = new History();
      write(history, 0, 1).ok(null);
      read(history, 1).ok(1);
      read(history, 2, "y").ok(7);
      const detail = checked(history, REGISTER, [budget(1)]);

      check.equal(
        seat,
        [detail.outcome, detail.partition, detail.steps, detail.limit],
        ["violated", ["y"], 2, undefined],
        "the steps of x and y",
      );
    });

    it("reports the first of two undecided partitions", ({ seat }) => {
      const history = new History();
      write(history, 0, 1).ok(null);
      read(history, 1).ok(1);
      write(history, 2, 2, "y").ok(null);
      read(history, 3, "y").ok(2);
      const detail = checked(history, REGISTER, [budget(1)]);

      check.equal(
        seat,
        [detail.outcome, detail.partition, detail.steps],
        ["undecided", ["x"], 1],
        "x is reported",
      );
    });

    it("counts a bit per call for each configuration of the memo", ({ seat }) => {
      const passed = checked(twoPartitions(), REGISTER, [memoLimit(4)]);
      const stopped = checked(twoPartitions(), REGISTER, [memoLimit(3)]);

      check.equal(
        seat,
        [
          passed.outcome,
          stopped.outcome,
          stopped.limit,
          stopped.steps,
          stopped.partition,
          callsOf(stopped.linearized),
          stopped.candidates,
        ],
        ["passed", "undecided", "memo", 2, ["x"], [0], []],
        "the second configuration of x needs four bits",
      );
    });

    it("counts an unknown call as open to the end of the history", ({ seat }) => {
      const history = new History();
      const first = write(history, 0, 1);
      const lost = write(history, 1, 2);
      lost.unknown("timed out");
      first.ok(null);
      const late = read(history, 2);
      read(history, 3).ok(9);
      late.ok(9);
      const detail = checked(history, REGISTER, []);

      check.equal(
        seat,
        [detail.outcome, detail.calls, detail.concurrency],
        ["violated", 4, 3],
        "three calls open at once",
      );
    });

    it("stops at the time limit once the time has passed", ({ seat }) => {
      const now = vi
        .spyOn(performance, "now")
        .mockReturnValueOnce(0)
        .mockReturnValue(5);
      onTestFinished(() => now.mockRestore());
      const detail = checked(twoPartitions(), REGISTER, [timeLimit(1)]);

      check.equal(
        seat,
        [detail.outcome, detail.limit, detail.steps, detail.states],
        ["undecided", "time", 0, [null]],
        "the search stops before its first step",
      );
    });

    it("reports what a check on one worker reports for more workers", ({ seat }) => {
      check.equal(
        seat,
        checked(twoPartitions(), REGISTER, [workers(4), budget(1)]),
        checked(twoPartitions(), REGISTER, [budget(1)]),
        "the same detail",
      );
    });

    it("throws a SpecError for a function of the spec that throws", ({ seat }) => {
      const broken: Spec<unknown> = {
        initial: () => null,
        next: (_state, op: Operation) => {
          throw new RangeError(`no ${op.name}`);
        },
      };
      const err = check.throws(
        seat,
        () => checked(twoPartitions(), broken, []),
        "the spec's next throws",
      );

      check.errorIs(seat, err, SpecError, "a SpecError");
    });
  });

  describe("whole", () => {
    it("passes a history without calls in no partition with the initial state", ({
      seat,
    }) => {
      const { detail, states } = whole(new History(), REGISTER);

      check.equal(
        seat,
        [detail.outcome, detail.partitions, detail.steps, states],
        ["passed", 0, 0, [null]],
        "the initial state",
      );
    });

    it("passes the calls of two keys in one partition with the states after them", ({
      seat,
    }) => {
      const history = new History();
      write(history, 0, 1, "x").ok(null);
      read(history, 1, "y").ok(1);
      const { detail, states } = whole(history, REGISTER);

      check.equal(
        seat,
        [detail.outcome, detail.partitions, detail.steps, states],
        ["passed", 1, 2, [1]],
        "the read of y follows the write of x",
      );
    });

    it("returns the frontier and no states for a violation of every call", ({
      seat,
    }) => {
      const history = new History();
      write(history, 0, 1).ok(null);
      read(history, 1).ok(2);
      const { detail, states } = whole(history, REGISTER);

      check.equal(
        seat,
        [detailJson(detail), states],
        [
          {
            outcome: "violated",
            partitions: 1,
            steps: 2,
            partition: [],
            calls: 2,
            concurrency: 1,
            linearized: [
              {
                call: 0,
                completion: 1,
                process: 0,
                operation: "write",
                args: [literal(1)],
                output: NULL,
              },
            ],
            states: [literal(1)],
            candidates: [
              {
                call: 2,
                completion: 3,
                process: 1,
                operation: "read",
                args: [],
                output: literal(2),
              },
            ],
            limit: null,
          },
          [],
        ],
        "the write, and the rejected read",
      );
    });
  });

  describe("fieldsOf", () => {
    it("returns null as the limit of a violated check", ({ seat }) => {
      const history = new History();
      read(history, 0).ok(1);

      check.equal(
        seat,
        fieldsOf(checked(history, REGISTER, []))["limit"],
        null,
        "no limit",
      );
    });

    it("returns the limit of an undecided check", ({ seat }) => {
      check.equal(
        seat,
        fieldsOf(checked(twoPartitions(), REGISTER, [budget(1)]))["limit"],
        "steps",
        "the steps limit",
      );
    });
  });

  describe("detailJson", () => {
    it("returns the limit of an undecided check by its name", ({ seat }) => {
      check.equal(
        seat,
        detailJson(checked(twoPartitions(), REGISTER, [budget(1)]))["limit"],
        "steps",
        "the steps limit",
      );
    });
  });

  describe("isLinearizable", () => {
    it("records a pass for a history that the spec accepts", ({ seat }) => {
      const recorder = new Recorder();
      isLinearizable(
        recorder,
        twoPartitions(),
        REGISTER,
        "the register is linearizable",
      );

      check.equal(
        seat,
        [recorder.failures, records(recorder)[0]?.["verdict"]],
        [[], "pass"],
        "a pass",
      );
    });

    it("fails with one record of linearizable at its call", ({ seat }) => {
      const history = new History();
      write(history, 0, 1).ok(null);
      read(history, 1).ok(null);
      const recorder = new Recorder();
      isLinearizable(recorder, history, REGISTER, "the register is linearizable");
      const [failure] = recorder.failures;

      check.equal(
        seat,
        [
          failure?.assertion,
          failure?.contract,
          Object.keys(failure?.detail ?? {}).sort(),
          records(recorder)[0]?.["detail"],
        ],
        [
          "linearizable",
          "the register is linearizable",
          [
            "calls",
            "candidates",
            "concurrency",
            "limit",
            "linearized",
            "outcome",
            "partition",
            "partitions",
            "states",
            "steps",
          ],
          detailJson(checked(history, REGISTER, [])),
        ],
        "the record and its call record",
      );
      check.hasSuffix(
        seat,
        failure?.where?.file,
        "linearizable.test.ts",
        "the call of isLinearizable",
      );
    });

    it("sends the sentence of the record to a seat without records", ({ seat }) => {
      const history = new History();
      read(history, 0).ok(1);
      const plain = new Plain();
      isLinearizable(plain, history, REGISTER, "the register is linearizable");

      check.hasPrefix(
        seat,
        plain.received[0]?.[1],
        "the register is linearizable: violated in the partition of",
        "the sentence",
      );
    });

    const tests: { name: string; give: [unknown, unknown]; want: string }[] = [
      {
        name: "a history that is no History",
        give: [[], REGISTER],
        want: "history.isLinearizable: the history is no History",
      },
      {
        name: "a spec without next",
        give: [new History(), { initial: () => null }],
        want: "history.isLinearizable: the spec states no initial or no next",
      },
      {
        name: "an initial that throws",
        give: [
          twoPartitions(),
          {
            initial: () => {
              throw new Error("boom");
            },
            next: () => [],
          },
        ],
        want: "history.isLinearizable: the spec's initial throws: boom",
      },
      {
        name: "a next that throws",
        give: [
          twoPartitions(),
          {
            initial: () => null,
            next: (_state: unknown, op: Operation) => {
              if (op.name === "read") throw new Error("boom");
              return [op.args[0]];
            },
          },
        ],
        want: 'history.isLinearizable: calls[2]: the spec\'s next throws on "read": boom',
      },
    ];
    for (const tt of tests) {
      it(`ends the call with a fault for ${tt.name}`, ({ seat }) => {
        const recorder = new Recorder();
        isLinearizable(
          recorder,
          tt.give[0] as History,
          tt.give[1] as Spec<unknown>,
          "c",
        );

        check.equal(seat, recorder.message, tt.want, "the fault");
      });
    }
  });
});
