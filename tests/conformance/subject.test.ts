/** The spec of the behaviours that a corpus case names in place of a callable. */

import { join } from "node:path";
import { describe } from "vitest";
import { SUBJECTS, type Subject, SubjectError } from "../../src/conformance/subject.js";
import { check, files } from "../../src/index.js";
import type { Seat } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { UNENFORCED } from "../helpers.js";

/** Returns the subject of kind, built anew. */
function build(kind: string): Subject {
  return (SUBJECTS[kind] as () => Subject)();
}

/** Calls the files shape of the subject of kind on the tree in dir. */
function touch(kind: string, dir: string): void {
  (build(kind).files as (dir: string) => void)(dir);
}

/** Returns a signal that has aborted. */
function aborted(): AbortSignal {
  const controller = new AbortController();
  controller.abort(new DOMException("cancelled", "AbortError"));
  return controller.signal;
}

/** Returns how many of runs attempts of the seated shape of subject recorded a failure. */
function failedAttempts(subject: Subject, runs: number): number {
  let failed = 0;
  for (let i = 0; i < runs; i += 1) {
    const trial = new Recorder();
    (subject.seated as (trial: Seat) => void)(trial);
    if (trial.failed) failed += 1;
  }
  return failed;
}

/** Returns how many of runs readings of the read shape of subject threw. */
function failedReadings(subject: Subject, runs: number): number {
  let failed = 0;
  for (let i = 0; i < runs; i += 1) {
    try {
      (subject.read as () => unknown)();
    } catch {
      failed += 1;
    }
  }
  return failed;
}

/** Returns the count that a counter reads after it calls call and advance once each. */
function countAfter(subject: Subject): number {
  (subject.call as (input: unknown) => unknown)(subject.input);
  (subject.advance as () => void)();
  return (subject.observe as () => number)();
}

describe("subject", () => {
  describe("SUBJECTS", () => {
    it("builds a returns-ok subject that resolves with an aborted signal", async ({
      seat,
    }) => {
      const subject = build("returns-ok");

      check.equal(
        seat,
        await (subject.signalled as (signal: AbortSignal) => Promise<unknown>)(
          aborted(),
        ),
        "did the work",
        "the subject does its work",
      );
    });

    it("builds a returns-ok subject whose shapes return", ({ seat }) => {
      const subject = build("returns-ok");

      check.equal(
        seat,
        [
          (subject.bare as () => unknown)(),
          (subject.call as (input: unknown) => unknown)(1),
          (subject.compute as (input: unknown) => unknown)(subject.input),
          subject.domain,
        ],
        [undefined, undefined, 1, [1, 2, 3]],
        "the subject succeeds and returns its input",
      );
    });

    it("builds a reads-handle subject that rejects with the reason of its signal", async ({
      seat,
    }) => {
      const signal = aborted();
      const read = build("reads-handle").signalled as (
        signal?: AbortSignal,
      ) => Promise<unknown>;
      const thrown = await check.rejectsWith(
        seat,
        () => read(signal),
        "the subject reads it",
      );

      check.isTrue(
        seat,
        thrown === signal.reason,
        "the rejection is the signal's reason",
      );
    });

    it("builds a reads-handle subject that resolves without a signal", async ({
      seat,
    }) => {
      const read = build("reads-handle").signalled as (
        signal?: AbortSignal,
      ) => Promise<unknown>;

      check.equal(seat, await read(), "did the work", "no signal stops it");
    });

    it("builds an ignores-handle subject that resolves with an aborted signal", async ({
      seat,
    }) => {
      const read = build("ignores-handle").signalled as (
        signal: AbortSignal,
      ) => Promise<unknown>;

      check.equal(
        seat,
        await read(aborted()),
        "did the work",
        "the subject ignores it",
      );
    });

    it("builds a raises subject whose bare shape throws a SubjectError", ({ seat }) => {
      const thrown = check.throws(
        seat,
        build("raises").bare as () => unknown,
        "the subject raises",
      );

      check.isTrue(seat, thrown instanceof SubjectError, "the error is a SubjectError");
    });

    it("builds a fails-otherwise subject that rejects with a SubjectError", async ({
      seat,
    }) => {
      const read = build("fails-otherwise").signalled as () => Promise<unknown>;
      const thrown = await check.rejectsWith(seat, read, "the subject fails");

      check.isTrue(seat, thrown instanceof SubjectError, "the error is a SubjectError");
    });

    it("builds a fails-otherwise subject whose call throws for its domain", ({
      seat,
    }) => {
      const subject = build("fails-otherwise");
      const thrown = check.throws(
        seat,
        () => (subject.call as (input: unknown) => unknown)(1),
        "the call fails",
      );

      check.isTrue(seat, thrown instanceof SubjectError, "the error is a SubjectError");
      check.equal(seat, subject.domain, [1, 2, 3], "the domain");
    });

    it("builds a dereferences-handle subject that rejects without a signal", async ({
      seat,
    }) => {
      const read = build("dereferences-handle").signalled as () => Promise<unknown>;
      const thrown = await check.rejectsWith(seat, read, "the subject reads it");

      check.isTrue(seat, thrown instanceof TypeError, "the error is a TypeError");
    });

    it("builds a never-settles subject whose every attempt fails", ({ seat }) => {
      check.equal(seat, failedAttempts(build("never-settles"), 4), 4, "four failures");
    });

    it("builds a never-settles subject whose every reading throws", ({ seat }) => {
      const subject = build("never-settles");
      (subject.induce as () => void)();

      check.equal(seat, failedReadings(subject, 4), 4, "four failed readings");
    });

    it("builds a settles-after subject whose first two attempts fail", ({ seat }) => {
      check.equal(seat, failedAttempts(build("settles-after"), 4), 2, "two failures");
    });

    it("builds a settles-after subject whose first two readings throw", ({ seat }) => {
      const subject = build("settles-after");
      (subject.induce as () => void)();

      check.equal(seat, failedReadings(subject, 4), 2, "two failed readings");
    });

    it("builds an accumulates subject whose call and advance raise the count", ({
      seat,
    }) => {
      const subject = build("accumulates");

      check.equal(
        seat,
        [countAfter(subject), subject.steps],
        [2, 5],
        "the count rose twice",
      );
    });

    it("builds a leaves-state-alone subject whose count is 0 after its calls", ({
      seat,
    }) => {
      check.equal(seat, countAfter(build("leaves-state-alone")), 0, "the count is 0");
    });

    it("builds a sets-value subject whose call sets the cell to its input", ({
      seat,
    }) => {
      const subject = build("sets-value");
      (subject.call as (input: unknown) => unknown)(subject.input);

      check.equal(
        seat,
        (subject.observe as () => number)(),
        7,
        "the cell is the input",
      );
    });

    it("builds a counts-calls subject whose computation counts its calls", ({
      seat,
    }) => {
      const compute = build("counts-calls").compute as (input: unknown) => unknown;

      check.equal(seat, [compute(1), compute(1)], [1, 2], "the calls count from 1");
    });

    it("builds an adds subject that adds its operands", ({ seat }) => {
      const subject = build("adds");
      const combine = subject.combine as (a: unknown, b: unknown) => unknown;

      check.equal(seat, [combine(2, 3), subject.operands], [5, [2, 3, 5]], "the sum");
    });

    it("builds a subtracts subject that subtracts its second operand", ({ seat }) => {
      const combine = build("subtracts").combine as (a: unknown, b: unknown) => unknown;

      check.equal(seat, combine(2, 3), -1, "the difference");
    });

    it("builds a renders-decimal subject that renders its input", ({ seat }) => {
      const subject = build("renders-decimal");

      check.equal(
        seat,
        (subject.render as (input: unknown) => string)(subject.input),
        "-42",
        "the decimal text",
      );
    });

    it("builds a drops-the-sign subject that renders the absolute value", ({
      seat,
    }) => {
      const subject = build("drops-the-sign");

      check.equal(
        seat,
        (subject.render as (input: unknown) => string)(subject.input),
        "42",
        "the text without the sign",
      );
    });

    it("builds a rotates subject that rotates its order on each iteration", ({
      seat,
    }) => {
      const iterate = build("rotates").iterate as () => readonly unknown[];

      check.equal(
        seat,
        [iterate(), iterate()],
        [
          [1, 2, 3, 4, 5],
          [2, 3, 4, 5, 1],
        ],
        "the second iteration starts one further",
      );
    });

    it("builds a repeats-an-element subject that yields 2 twice", ({ seat }) => {
      const iterate = build("repeats-an-element").iterate as () => readonly unknown[];

      check.equal(seat, iterate(), [1, 2, 2, 3], "the iteration");
    });

    it("builds a yields-in-order subject that yields one order", ({ seat }) => {
      const iterate = build("yields-in-order").iterate as () => readonly unknown[];

      check.equal(
        seat,
        [iterate(), iterate()],
        [
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
        ],
        "one order",
      );
    });

    it("builds a wraps-around subject whose count returns to 0 after 3", ({ seat }) => {
      const subject = build("wraps-around");
      const advance = subject.advance as () => void;
      for (let i = 0; i < 4; i += 1) advance();

      check.equal(seat, (subject.observe as () => number)(), 0, "the count wrapped");
    });

    it("builds a refuses-after-close subject whose call throws its sentinel after close", ({
      seat,
    }) => {
      const subject = build("refuses-after-close");
      const use = subject.use as () => unknown;
      check.doesNotThrow(seat, use, "the open subject serves");
      (subject.close as () => void)();
      const thrown = check.throws(seat, use, "the closed subject refuses");

      check.isTrue(seat, thrown === subject.sentinel, "the refusal is the sentinel");
    });

    it("builds a serves-after-close subject whose call succeeds after close", ({
      seat,
    }) => {
      const subject = build("serves-after-close");
      (subject.close as () => void)();

      check.doesNotThrow(
        seat,
        subject.use as () => unknown,
        "the closed subject serves",
      );
    });

    it("builds a yields-one-object-twice subject whose elements are one object", ({
      seat,
    }) => {
      const [first, second] = (
        build("yields-one-object-twice").iterate as () => unknown[]
      )();

      check.isTrue(seat, first === second, "one object twice");
    });

    it("builds a yields-two-equal-objects subject whose elements are two objects", ({
      seat,
    }) => {
      const [first, second] = (
        build("yields-two-equal-objects").iterate as () => unknown[]
      )();

      check.isTrue(seat, first !== second, "two objects");
      check.equal(seat, first, second, "of one value");
    });

    it.skipIf(UNENFORCED)(
      "builds a leaves-files-alone subject that reads every file",
      ({ seat }) => {
        const dir = files.workspace(seat, {
          "docs/a.md": files.text("a").withMode(0o000),
        });

        check.throws(
          seat,
          () => touch("leaves-files-alone", dir),
          "the unreadable file is read",
        );
      },
    );

    it("builds a leaves-files-alone subject that writes nothing", async ({ seat }) => {
      const dir = files.workspace(seat, {
        "a.txt": files.text("a"),
        b: files.link("a.txt"),
      });

      await files.unchanged(
        seat,
        dir,
        () => touch("leaves-files-alone", dir),
        "the tree",
      );
    });

    it.skipIf(UNENFORCED)(
      "builds a rewrites-files subject that writes every file",
      ({ seat }) => {
        const dir = files.workspace(seat, {
          "docs/a.md": files.text("a").withMode(0o400),
        });

        check.throws(
          seat,
          () => touch("rewrites-files", dir),
          "the read-only file is written",
        );
      },
    );

    it.skipIf(UNENFORCED)(
      "builds a rewrites-files subject that follows no link",
      ({ seat }) => {
        const outside = files.workspace(seat, {
          "a.txt": files.text("a").withMode(0o400),
        });
        const dir = files.workspace(seat, { b: files.link(join(outside, "a.txt")) });

        check.doesNotThrow(
          seat,
          () => touch("rewrites-files", dir),
          "the link is not followed",
        );
      },
    );

    it("builds a rewrites-files subject that writes the bytes that each file has", async ({
      seat,
    }) => {
      const dir = files.workspace(seat, {
        "a.txt": files.text("a"),
        "keys/id": files.text("s"),
      });

      await files.unchanged(seat, dir, () => touch("rewrites-files", dir), "the tree");
    });

    it("builds a writes-a-file subject that writes new.txt", ({ seat }) => {
      const dir = files.workspace(seat, {});
      touch("writes-a-file", dir);

      files.hasContent(seat, join(dir, "new.txt"), "new", "the file is written");
    });

    it("builds a writes-a-large-file subject that writes 65,537 bytes", ({ seat }) => {
      const dir = files.workspace(seat, {});
      touch("writes-a-large-file", dir);

      files.hasContent(
        seat,
        join(dir, "large.bin"),
        "a".repeat(65_537),
        "the file is written",
      );
    });
  });
});
