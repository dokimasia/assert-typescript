/** The spec of a tree of files and of the rules that every tree keeps. */

import { describe } from "vitest";
import { directory, Entry, link, text } from "../../src/files/entry.js";
import {
  check as checkTree,
  compareBytes,
  full,
  mapOf,
  parentsOf,
  pathFault,
  pathsOf,
  treeOf,
} from "../../src/files/tree.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

describe("tree", () => {
  describe("compareBytes", () => {
    it("orders a path below U+10000 before one above it, as UTF-8 orders them", ({
      seat,
    }) => {
      // UTF-16 code units order the two the other way round.
      check.isTrue(seat, compareBytes("￿", "\u{10000}") < 0, "U+FFFF comes first");
    });

    it("returns 0 for equal paths", ({ seat }) => {
      check.equal(seat, compareBytes("a/b", "a/b"), 0, "equal paths");
    });
  });

  describe("pathsOf", () => {
    it("returns the paths in the order of their UTF-8 bytes", ({ seat }) => {
      check.equal(
        seat,
        pathsOf(["b", "\u{10000}", "a/b", "￿", "a"]),
        ["a", "a/b", "b", "￿", "\u{10000}"],
        "the order",
      );
    });
  });

  describe("parentsOf", () => {
    it("returns the directories above a path, outermost first", ({ seat }) => {
      check.equal(seat, parentsOf("a/b/c"), ["a", "a/b"], "the parents");
    });

    it("returns no directory for a path of one name", ({ seat }) => {
      check.isEmpty(seat, parentsOf("a"), "a name at the root has no parent");
    });
  });

  describe("pathFault", () => {
    const tests = [
      {
        name: "returns undefined for a path of names",
        give: "a/b.txt",
        want: undefined,
      },
      {
        name: "returns the fault of an empty path",
        give: "",
        want: 'the path "" has the name ""',
      },
      {
        name: "returns the fault of an empty name",
        give: "a//b",
        want: 'the path "a//b" has the name ""',
      },
      {
        name: "returns the fault of the name .",
        give: "./a",
        want: 'the path "./a" has the name "."',
      },
      {
        name: "returns the fault of the name ..",
        give: "a/..",
        want: 'the path "a/.." has the name ".."',
      },
      {
        name: "returns the fault of a name with a backslash",
        give: "a\\b",
        want: 'the path "a\\\\b" has the name "a\\\\b"',
      },
      {
        name: "returns the fault of a name with NUL",
        give: "a\0b",
        want: 'the path "a\\u0000b" has the name "a\\u0000b"',
      },
      {
        name: "returns the fault of a path that is no UTF-8 text",
        give: "\ud800",
        want: 'the path "\\ud800" is no UTF-8 text',
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, pathFault(tt.give), tt.want, "the fault of the path");
      });
    }
  });

  describe("check", () => {
    it("passes a tree that keeps the rules of a tree", ({ seat }) => {
      const tree = new Map([
        ["a/b.txt", text("b")],
        ["c", directory()],
        ["d", link("../outside")],
      ]);

      check.equal(
        seat,
        thrown(() => checkTree(tree)),
        "",
        "the tree keeps the rules",
      );
    });

    const tests = [
      {
        name: "throws the fault of a path that breaks a rule of a path",
        give: new Map<string, unknown>([["a//b", text("a")]]),
        want: 'a//b: the path "a//b" has the name ""',
      },
      {
        name: "throws the fault of an entry that states nothing",
        give: new Map<string, unknown>([["a", new Entry()]]),
        want: "a: the entry states no file, directory or link",
      },
      {
        name: "throws the fault of a value that is no entry",
        give: new Map<string, unknown>([["a", "text"]]),
        want: "a: the entry states no file, directory or link",
      },
      {
        name: "throws the fault of a link to no target",
        give: new Map<string, unknown>([["a", link("")]]),
        want: 'a: the link to "" states no target of UTF-8 text without NUL',
      },
      {
        name: "throws the fault of a link whose target contains NUL",
        give: new Map<string, unknown>([["a", link("b\0")]]),
        want: 'a: the link to "b\\u0000" states no target of UTF-8 text without NUL',
      },
      {
        name: "throws the fault of a link whose target is no UTF-8 text",
        give: new Map<string, unknown>([["a", link("\ud800")]]),
        want: 'a: the link to "\\ud800" states no target of UTF-8 text without NUL',
      },
      {
        name: "throws the fault of an entry below a file",
        give: new Map<string, unknown>([
          ["a", text("a")],
          ["a/b", text("b")],
        ]),
        want: 'a/b: the entry is below "a", which is a file',
      },
      {
        name: "throws the fault of an entry below a link",
        give: new Map<string, unknown>([
          ["a", link("x")],
          ["a/b/c", text("c")],
        ]),
        want: 'a/b/c: the entry is below "a", which is a link',
      },
      {
        name: "throws the fault of the first path in path order",
        give: new Map<string, unknown>([
          ["b", new Entry()],
          ["a", new Entry()],
        ]),
        want: "a: the entry states no file, directory or link",
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => checkTree(tt.give)),
          tt.want,
          "the fault",
        );
      });
    }
  });

  describe("full", () => {
    it("adds each directory that a path implies, without a mode", ({ seat }) => {
      const whole = full(new Map([["a/b/c.txt", text("c")]]));

      check.equal(
        seat,
        treeOf(whole),
        { a: directory(), "a/b": directory(), "a/b/c.txt": text("c") },
        "the implied directories",
      );
    });

    it("keeps a directory that the tree states", ({ seat }) => {
      const stated = directory().withMode(0o700);
      const whole = full(
        new Map([
          ["a", stated],
          ["a/b.txt", text("b")],
        ]),
      );

      check.isTrue(seat, whole.get("a") === stated, "the stated directory is kept");
    });
  });

  describe("mapOf", () => {
    it("returns the entries of a tree by path", ({ seat }) => {
      check.equal(
        seat,
        [...mapOf({ "a.txt": text("a"), b: directory() })],
        [
          ["a.txt", text("a")],
          ["b", directory()],
        ],
        "the entries",
      );
    });
  });

  describe("treeOf", () => {
    it("returns a tree whose paths are in path order", ({ seat }) => {
      const tree = treeOf(
        new Map([
          ["b", text("b")],
          ["a", text("a")],
        ]),
      );

      check.equal(seat, Object.keys(tree), ["a", "b"], "the order of the paths");
    });
  });
});
