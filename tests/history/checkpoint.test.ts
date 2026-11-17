// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the searches that a checkpoint keeps. Each check reports what
 * a check of every call reports. The spec counts the calls of the next of
 * its register, so it reads which searches a check continues and which it
 * searches again from their first call.
 */

import { describe } from "vitest";
import { Checkpoint } from "../../src/history/checkpoint.js";
import { History } from "../../src/history/history.js";
import { check as checked, whole } from "../../src/history/linearizable.js";
import {
  budget,
  memoLimit,
  type Option,
  resume,
  workers,
} from "../../src/history/option.js";
import type { Spec } from "../../src/history/spec.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { REGISTER, thrown } from "../helpers.js";

/** The register of the specs, which counts the calls of its next in calls. */
function counted(calls: { n: number }): Spec<unknown> {
  return {
    ...REGISTER,
    next: (state, op) => {
      calls.n += 1;
      return REGISTER.next(state, op);
    },
  };
}

/** A register whose next throws for each operation. */
const THROWING: Spec<unknown> = {
  ...REGISTER,
  next: (state, op) => {
    throw new Error(`no ${op.name} after ${String(state)}`);
  },
};

/** Returns the outcome, the partitions, the steps and the calls of next of a check of history with checkpoint. */
function resumed(
  history: History,
  checkpoint: Checkpoint<unknown>,
  ...options: Option[]
): [string, number, number, number] {
  const calls = { n: 0 };
  const detail = checked(history, counted(calls), [...options, resume(checkpoint)]);
  return [detail.outcome, detail.partitions, detail.steps, calls.n];
}

/** Returns what resumed returns for a check of history without a checkpoint. */
function every(
  history: History,
  ...options: Option[]
): [string, number, number, number] {
  const calls = { n: 0 };
  const detail = checked(history, counted(calls), options);
  return [detail.outcome, detail.partitions, detail.steps, calls.n];
}

describe("checkpoint", () => {
  describe("new Checkpoint", () => {
    it("keeps no search", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(1);

      check.isEqualTo(
        seat,
        resumed(history, new Checkpoint()),
        ["passed", 1, 2, 2],
        "the first check steps each call once",
      );
    });
  });

  describe("resumed", () => {
    it("continues the search of a partition over its new calls", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      resumed(history, checkpoint);
      history.invoke(0, "write", [2], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(2);

      check.isEqualTo(
        seat,
        [resumed(history, checkpoint), every(history)],
        [
          ["passed", 1, 3, 2],
          ["passed", 1, 3, 3],
        ],
        "the second check steps the two new calls",
      );
    });

    it("takes no step for a partition without new calls", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "write", [2], "y").ok(null);
      resumed(history, checkpoint);
      history.invoke(1, "read", [], "y").ok(2);

      check.isEqualTo(
        seat,
        resumed(history, checkpoint),
        ["passed", 2, 3, 1],
        "the partition of x keeps its outcome without a step",
      );
    });

    it("continues a partition whose call states two of its keys", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x", "z").ok(null);
      resumed(history, checkpoint);
      history.invoke(0, "write", [2], "x", "z").ok(null);

      check.isEqualTo(
        seat,
        resumed(history, checkpoint),
        ["passed", 1, 2, 1],
        "the second write joins the one partition of x and z",
      );
    });

    for (const give of ["ok", "unknown"] as const) {
      it(`searches the partition of a pending call that completes as ${give} again`, ({
        seat,
      }) => {
        const history = new History();
        const checkpoint = new Checkpoint<unknown>();
        const pending = history.invoke(0, "write", [1], "x");
        resumed(history, checkpoint);
        if (give === "ok") {
          pending.ok(null);
        } else {
          pending.unknown("timed out");
        }
        history.invoke(1, "read", [], "x").ok(1);

        check.isEqualTo(
          seat,
          [resumed(history, checkpoint), every(history)],
          [
            ["passed", 1, 2, 2],
            ["passed", 1, 2, 2],
          ],
          "the partition searches from its first call",
        );
      });
    }

    it("splits the partition of a pending call that fails", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "write", [2], "y").ok(null);
      const pending = history.invoke(2, "write", [3], "x", "y");
      resumed(history, checkpoint);
      pending.fail("refused");
      history.invoke(0, "read", [], "x").ok(1);

      check.isEqualTo(
        seat,
        [resumed(history, checkpoint), every(history)],
        [
          ["passed", 2, 3, 3],
          ["passed", 2, 3, 3],
        ],
        "the failed write leaves, and x and y form two partitions",
      );
    });

    it("searches a partition that a new call joins again", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x", "w").ok(null);
      history.invoke(1, "write", [2], "y").ok(null);
      resumed(history, checkpoint);
      history.invoke(2, "write", [3], "x", "w", "y", "z").ok(null);

      check.isEqualTo(
        seat,
        [resumed(history, checkpoint), every(history)],
        [
          ["passed", 1, 3, 3],
          ["passed", 1, 3, 3],
        ],
        "the joined partition searches from its first call",
      );
    });

    it("joins every partition for a new call without keys", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "write", [2], "y").ok(null);
      resumed(history, checkpoint);
      history.invoke(2, "write", [3]).ok(null);

      check.isEqualTo(
        seat,
        [resumed(history, checkpoint), every(history)],
        [
          ["passed", 1, 3, 3],
          ["passed", 1, 3, 3],
        ],
        "the one partition of every key searches from its first call",
      );
    });

    it("continues a partition that a call without keys extends", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      resumed(history, checkpoint);
      history.invoke(1, "write", [2]).ok(null);
      resumed(history, checkpoint);
      history.invoke(0, "read", [], "x").ok(2);

      check.isEqualTo(
        seat,
        [resumed(history, checkpoint), every(history)],
        [
          ["passed", 1, 3, 1],
          ["passed", 1, 3, 3],
        ],
        "the read joins the partition of every key",
      );
    });

    it("starts the partition of every key with a call without keys", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1]).ok(null);
      resumed(history, checkpoint);
      history.invoke(1, "write", [2], "x").ok(null);

      check.isEqualTo(
        seat,
        resumed(history, checkpoint),
        ["passed", 1, 2, 1],
        "the write of x joins the partition of every key",
      );
    });

    it("searches every partition of another history again", ({ seat }) => {
      const checkpoint = new Checkpoint<unknown>();
      const first = new History();
      first.invoke(0, "write", [1], "x").ok(null);
      resumed(first, checkpoint);
      const second = new History();
      second.invoke(0, "write", [1], "x").ok(null);

      check.isEqualTo(
        seat,
        resumed(second, checkpoint),
        ["passed", 1, 1, 1],
        "the write steps once more",
      );
    });

    for (const tt of [
      { name: "budget", give: budget(100) },
      { name: "memo limit", give: memoLimit(2 ** 20) },
    ]) {
      it(`searches every partition under another ${tt.name} again`, ({ seat }) => {
        const history = new History();
        const checkpoint = new Checkpoint<unknown>();
        history.invoke(0, "write", [1], "x").ok(null);
        resumed(history, checkpoint);
        history.invoke(1, "read", [], "x").ok(1);

        check.isEqualTo(
          seat,
          resumed(history, checkpoint, tt.give),
          ["passed", 1, 2, 2],
          "the partition searches from its first call",
        );
      });
    }

    it("searches a partition whose memo passes the grown capacity again", ({
      seat,
    }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(1);
      resumed(history, checkpoint, memoLimit(5));
      history.invoke(0, "write", [2], "x").ok(null);

      check.isEqualTo(
        seat,
        resumed(history, checkpoint, memoLimit(5)),
        ["undecided", 1, 2, 2],
        "the search starts again and stops at the memo limit",
      );
    });

    it("searches on two workers", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "write", [2], "y").ok(null);
      resumed(history, checkpoint, workers(2));
      history.invoke(0, "read", [], "x").ok(1);
      history.invoke(1, "read", [], "y").ok(2);

      check.isEqualTo(
        seat,
        resumed(history, checkpoint, workers(2)),
        ["passed", 2, 4, 2],
        "each partition steps its new read",
      );
    });
  });

  describe("forget", () => {
    it("follows a check that does not pass", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(3);
      resumed(history, checkpoint);
      history.invoke(0, "write", [2], "x").ok(null);

      check.isEqualTo(
        seat,
        [resumed(history, checkpoint), every(history)],
        [
          ["violated", 1, 2, 2],
          ["violated", 1, 2, 2],
        ],
        "the second check searches from the first call",
      );
    });

    it("follows a check whose spec throws", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      const refused = thrown(() => checked(history, THROWING, [resume(checkpoint)]));

      check.isEqualTo(
        seat,
        [refused, resumed(history, checkpoint)],
        ['the spec\'s next throws on "write"', ["passed", 1, 1, 1]],
        "the second check searches from the first call",
      );
    });
  });

  describe("whole", () => {
    it("continues the search of every call", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      whole(history, counted({ n: 0 }), checkpoint);
      history.invoke(1, "read", [], "y").ok(1);
      const calls = { n: 0 };
      const { detail, states } = whole(history, counted(calls), checkpoint);

      check.isEqualTo(
        seat,
        [detail.outcome, detail.partitions, detail.steps, states, calls.n],
        ["passed", 1, 2, [1], 1],
        "the read joins the one partition, and steps once",
      );
    });

    it("drops a pending call that fails", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      const pending = history.invoke(1, "write", [2], "y");
      whole(history, counted({ n: 0 }), checkpoint);
      pending.fail("refused");
      const calls = { n: 0 };
      const { detail, states } = whole(history, counted(calls), checkpoint);

      check.isEqualTo(
        seat,
        [detail.outcome, detail.steps, states, calls.n],
        ["passed", 1, [1], 1],
        "the one partition searches the write of 1 again",
      );
    });

    it("searches a history of partitions after whole again", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      whole(history, counted({ n: 0 }), checkpoint);

      check.isEqualTo(
        seat,
        resumed(history, checkpoint),
        ["passed", 1, 1, 1],
        "the check of partitions searches from the first call",
      );
    });

    it("passes a history without calls", ({ seat }) => {
      const { detail, states } = whole(
        new History(),
        counted({ n: 0 }),
        new Checkpoint(),
      );

      check.isEqualTo(
        seat,
        [detail.outcome, detail.partitions, detail.steps, states],
        ["passed", 0, 0, [null]],
        "the check passes without a partition in the initial state",
      );
    });

    it("forgets the search of a violated check", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "read", [], "x").ok(3);
      whole(history, counted({ n: 0 }), checkpoint);
      const calls = { n: 0 };
      const { detail } = whole(history, counted(calls), checkpoint);

      check.isEqualTo(
        seat,
        [detail.outcome, calls.n],
        ["violated", 2],
        "the second check searches from the first call",
      );
    });

    it("forgets the search of a check whose spec throws", ({ seat }) => {
      const history = new History();
      const checkpoint = new Checkpoint<unknown>();
      history.invoke(0, "write", [1], "x").ok(null);
      const refused = thrown(() => whole(history, THROWING, checkpoint));
      const calls = { n: 0 };
      const { detail } = whole(history, counted(calls), checkpoint);

      check.isEqualTo(
        seat,
        [refused, detail.outcome, calls.n],
        ['the spec\'s next throws on "write"', "passed", 1],
        "the second check searches from the first call",
      );
    });
  });
});
