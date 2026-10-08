/** The spec of the assertions that compare the tree in a directory with a wanted tree. */

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { contains, equal, unchanged } from "../../src/files/compare.js";
import { Entry, text } from "../../src/files/entry.js";
import { workspace } from "../../src/files/workspace.js";
import { check } from "../../src/index.js";
import { dropped } from "../../src/matcher/pending.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { records, temporary } from "../helpers.js";

/** Returns the verdict of each call record of recorder. */
function verdicts(recorder: Recorder): unknown[] {
  return records(recorder).map((r) => r["verdict"]);
}

describe("compare", () => {
  describe("equal", () => {
    it("passes the tree of the directory", ({ seat }) => {
      const dir = workspace(seat, { "a.txt": text("a"), "docs/b.md": text("b") });
      const recorder = new Recorder();
      equal(recorder, dir, { "docs/b.md": text("b"), "a.txt": text("a") }, "the tree");

      check.equal(seat, verdicts(recorder), ["pass"], "the trees are equal");
    });

    it("reports the record of tree-equal for a tree that differs", ({ seat }) => {
      const dir = workspace(seat, { "a.txt": text("a"), "c.txt": text("c") });
      const recorder = new Recorder();
      equal(recorder, dir, { "a.txt": text("x"), "b.txt": text("b") }, "the tree");
      const [failure] = recorder.failures;

      check.equal(
        seat,
        [failure?.assertion, failure?.contract, failure?.detail],
        [
          "tree-equal",
          "the tree",
          {
            want: { "a.txt": text("x"), "b.txt": text("b") },
            got: { "a.txt": text("a"), "c.txt": text("c") },
            differences: 3,
          },
        ],
        "the record",
      );
    });

    it("reports the call site of the test", ({ seat }) => {
      const dir = workspace(seat, {});
      const recorder = new Recorder();
      equal(recorder, dir, { "a.txt": text("a") }, "the tree");

      check.contains(
        seat,
        recorder.failures[0]?.where?.file ?? "",
        "compare.test.ts",
        "the call site is this spec",
      );
    });

    it("ends the call with a fault for a wanted tree that breaks a rule", ({
      seat,
    }) => {
      const recorder = new Recorder();
      equal(recorder, temporary(), { a: new Entry() }, "the tree");

      check.equal(
        seat,
        [recorder.message, verdicts(recorder)],
        ["files.equal: a: the entry states no file, directory or link", ["error"]],
        "the fault",
      );
    });

    it("ends the call with a fault for a tree that cannot be read", ({ seat }) => {
      const recorder = new Recorder();
      equal(recorder, join(temporary(), "missing"), {}, "the tree");

      check.hasPrefix(
        seat,
        recorder.message,
        "files.equal: the tree cannot be read: ENOENT",
        "the fault",
      );
    });
  });

  describe("contains", () => {
    it("passes a tree that has more entries than the wanted one", ({ seat }) => {
      const dir = workspace(seat, { "a.txt": text("a"), "b.txt": text("b") });
      const recorder = new Recorder();
      contains(recorder, dir, { "b.txt": text("b") }, "the tree");

      check.equal(seat, verdicts(recorder), ["pass"], "the tree contains the entry");
    });

    it("reports the record of tree-contains for a missing entry", ({ seat }) => {
      const dir = workspace(seat, { "a.txt": text("a") });
      const recorder = new Recorder();
      contains(recorder, dir, { "b.txt": text("b") }, "the tree");

      check.equal(
        seat,
        [recorder.failures[0]?.assertion, recorder.failures[0]?.detail],
        ["tree-contains", { want: { "b.txt": text("b") }, got: {}, differences: 1 }],
        "the record",
      );
    });

    it("ends the call with a fault that names contains", ({ seat }) => {
      const recorder = new Recorder();
      contains(recorder, join(temporary(), "missing"), {}, "the tree");

      check.hasPrefix(seat, recorder.message, "files.contains: ", "the fault");
    });
  });

  describe("unchanged", () => {
    it("passes a callable that writes nothing", async ({ seat }) => {
      const dir = workspace(seat, { "a.txt": text("a") });
      const recorder = new Recorder();
      await unchanged(recorder, dir, () => undefined, "nothing is written");

      check.equal(seat, verdicts(recorder), ["pass"], "the tree is unchanged");
    });

    it("reports the record of tree-unchanged for a callable that writes a file", async ({
      seat,
    }) => {
      const dir = workspace(seat, { "a.txt": text("a") });
      const recorder = new Recorder();
      await unchanged(
        recorder,
        dir,
        () => writeFileSync(join(dir, "a.txt"), "b"),
        "nothing is written",
      );

      check.equal(
        seat,
        [recorder.failures[0]?.assertion, recorder.failures[0]?.detail],
        [
          "tree-unchanged",
          {
            want: { "a.txt": text("a").withMode(0o644) },
            got: { "a.txt": text("b").withMode(0o644) },
            differences: 1,
          },
        ],
        "the record",
      );
    });

    it("awaits a callable that returns a promise", async ({ seat }) => {
      const dir = workspace(seat, {});
      const recorder = new Recorder();
      await unchanged(
        recorder,
        dir,
        async () => {
          await Promise.resolve();
          writeFileSync(join(dir, "late.txt"), "late");
        },
        "nothing is written",
      );

      check.equal(seat, verdicts(recorder), ["fail"], "the late write is seen");
    });

    it("rejects with the error of a callable that throws, and reports nothing", async ({
      seat,
    }) => {
      const dir = workspace(seat, {});
      const recorder = new Recorder();
      await check.rejectsWith(
        seat,
        () =>
          unchanged(
            recorder,
            dir,
            () => {
              throw new Error("the subject broke");
            },
            "nothing is written",
          ),
        "the error of the callable ends the call",
      );

      check.isEmpty(seat, records(recorder), "the call has no verdict");
    });

    it("ends the call with a fault for a tree that cannot be read before the call", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      let called = false;
      await unchanged(
        recorder,
        join(temporary(), "missing"),
        () => {
          called = true;
        },
        "nothing is written",
      );

      check.hasPrefix(
        seat,
        recorder.message,
        "files.unchanged: the tree cannot be read",
        "the fault",
      );
      check.isFalse(seat, called, "the callable is not called");
    });

    it("ends the call with a fault for a tree that cannot be read after the call", async ({
      seat,
    }) => {
      const dir = temporary();
      const recorder = new Recorder();
      await unchanged(
        recorder,
        dir,
        () => rmSync(dir, { recursive: true }),
        "nothing is written",
      );

      check.hasPrefix(
        seat,
        recorder.message,
        "files.unchanged: the tree cannot be read",
        "the fault",
      );
    });

    it("returns a promise that the forgotten-await guard tracks", ({ seat }) => {
      const recorder = new Recorder();
      void unchanged(recorder, temporary(), () => undefined, "nothing is written");

      check.equal(
        seat,
        dropped(recorder),
        ["nothing is written"],
        "the call is tracked",
      );
    });
  });
});
