/** The spec of the record of a comparison of trees that fails. */

import { describe } from "vitest";
import { callSite } from "../../src/failure.js";
import { directory, type Entry, executable, text } from "../../src/files/entry.js";
import { comparison, MAX_PATHS, missing, report } from "../../src/files/record.js";
import { treeOf } from "../../src/files/tree.js";
import { check } from "../../src/index.js";
import { Running } from "../../src/matcher/verdict.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { records } from "../helpers.js";

/** Returns a tree of n files f00.txt, f01.txt and so on, of the content. */
function numbered(n: number, content: string): Map<string, Entry> {
  return new Map(
    Array.from({ length: n }, (_, i): [string, Entry] => [
      `f${String(i).padStart(2, "0")}.txt`,
      text(content),
    ]),
  );
}

describe("record", () => {
  describe("MAX_PATHS", () => {
    it("contains 64 paths", ({ seat }) => {
      check.equal(seat, MAX_PATHS, 64, "the most paths of a record");
    });
  });

  describe("comparison", () => {
    it("returns undefined when no path differs", ({ seat }) => {
      check.isNil(seat, comparison(new Map(), new Map(), []), "there is no record");
    });

    it("returns a missing entry in want, an extra one in got, and a changed one in both", ({
      seat,
    }) => {
      const want = new Map([
        ["a.txt", text("a")],
        ["b.txt", text("b")],
      ]);
      const got = new Map([
        ["a.txt", text("x")],
        ["c.txt", text("c")],
      ]);
      const record = comparison(want, got, ["a.txt", "b.txt", "c.txt"]);

      check.equal(
        seat,
        [
          treeOf(record?.want ?? new Map()),
          treeOf(record?.got ?? new Map()),
          record?.differences,
        ],
        [
          { "a.txt": text("a"), "b.txt": text("b") },
          { "a.txt": text("x"), "c.txt": text("c") },
          3,
        ],
        "the record",
      );
    });

    it("lists the first 64 paths and counts every one", ({ seat }) => {
      const want = numbered(65, "b");
      const got = numbered(65, "a");
      const record = comparison(want, got, [...want.keys()]);

      check.equal(
        seat,
        [record?.want?.size, record?.got.size, record?.differences],
        [64, 64, 65],
        "the record lists 64 of 65 paths",
      );
    });

    it("states the mode of an entry read only where the wanted entry states one", ({
      seat,
    }) => {
      const want = new Map([
        ["key", text("a").withMode(0o600)],
        ["run.sh", text("b")],
        ["docs", directory()],
      ]);
      const got = new Map([
        ["key", text("x").withMode(0o644)],
        ["run.sh", text("y").withMode(0o755)],
        ["docs", directory().withMode(0o700)],
      ]);
      const record = comparison(want, got, ["docs", "key", "run.sh"]);

      check.equal(
        seat,
        treeOf(record?.got ?? new Map()),
        {
          docs: directory(),
          key: text("x").withMode(0o644),
          "run.sh": executable("y"),
        },
        "the entries as the comparison read them",
      );
    });
  });

  describe("missing", () => {
    it("returns no wanted tree, the entries read without their modes, and their number", ({
      seat,
    }) => {
      const got = new Map([
        ["a.txt", text("a").withMode(0o600)],
        ["run.sh", text("r").withMode(0o755)],
      ]);
      const record = missing(got);

      check.equal(
        seat,
        [record.want, treeOf(record.got), record.differences],
        [null, { "a.txt": text("a"), "run.sh": executable("r") }, 2],
        "the record of a missing golden tree",
      );
    });

    it("lists the first 64 entries and counts every one", ({ seat }) => {
      const record = missing(numbered(65, "a"));

      check.equal(seat, [record.got.size, record.differences], [64, 65], "the record");
    });
  });

  describe("report", () => {
    it("reports a pass without a record", ({ seat }) => {
      const recorder = new Recorder();
      report(
        Running.of(recorder),
        "tree-equal",
        "the trees are equal",
        undefined,
        undefined,
      );

      check.equal(
        seat,
        [recorder.failures, records(recorder).map((r) => r["verdict"])],
        [[], ["pass"]],
        "the call passes",
      );
    });

    it("reports a failure whose detail states trees and whose call record states tree literals", ({
      seat,
    }) => {
      const recorder = new Recorder();
      const where = callSite();
      report(
        Running.of(recorder),
        "tree-equal",
        "the trees are equal",
        { want: new Map([["a.txt", text("a")]]), got: new Map(), differences: 1 },
        where,
      );
      const [failure] = recorder.failures;

      check.equal(
        seat,
        [failure?.assertion, failure?.detail, failure?.where],
        [
          "tree-equal",
          { want: { "a.txt": text("a") }, got: {}, differences: 1 },
          where,
        ],
        "the record",
      );
      check.equal(
        seat,
        records(recorder)[0]?.["detail"],
        {
          want: { type: "tree", entries: [{ path: "a.txt", text: "a" }] },
          got: { type: "tree", entries: [] },
          differences: { type: "int", value: 1 },
        },
        "the call record",
      );
    });

    it("reports want null for a record without a wanted tree", ({ seat }) => {
      const recorder = new Recorder();
      report(
        Running.of(recorder),
        "golden-match-tree",
        "the tree matches",
        missing(new Map()),
        undefined,
      );

      check.equal(
        seat,
        [recorder.failures[0]?.detail["want"], records(recorder)[0]?.["detail"]],
        [
          null,
          {
            want: { type: "null" },
            got: { type: "tree", entries: [] },
            differences: { type: "int", value: 0 },
          },
        ],
        "the missing tree",
      );
    });
  });
});
