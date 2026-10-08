/**
 * The spec of the runners of the files vectors: the rules that the
 * definition's vectors cannot drive, such as the refusal of a vector that
 * misstates its inputs or its outputs. It uses vitest's `expect` alone,
 * because a runner decides the verdict of every files vector.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT, RUNNERS, type Runner } from "../../src/conformance/files.js";
import { enter, temporary, UNENFORCED } from "../helpers.js";

/** The tree of no entry. */
const NO_FILES = { type: "tree", entries: [] };

/** The tree of the file a.txt, of the text a. */
const A_FILE = { type: "tree", entries: [{ path: "a.txt", text: "a" }] };

/** The tree of the file a.txt, which its owner may read and not write. */
const READ_ONLY_FILE = {
  type: "tree",
  entries: [{ path: "a.txt", text: "a", mode: 0o400 }],
};

/** A typed literal of another type than tree. */
const LIST = { type: "list" };

/** Returns the string literal of value. */
function string(value: string): Record<string, unknown> {
  return { type: "string", value };
}

/** The int literal of 1. */
const ONE = { type: "int", value: 1 };

/** Returns the message of the fault of the run of raw as a vector of kind in dir, or the empty string. */
async function faultOf(
  kind: string,
  raw: Record<string, unknown>,
  dir = temporary(),
): Promise<string> {
  try {
    await (RUNNERS[kind] as Runner)(raw, dir);
  } catch (err) {
    return (err as Error).message;
  }
  return "";
}

/** Returns a golden-match-tree vector of the workspace A_FILE that expects a pass. */
function golden(
  args: unknown[],
  tree: unknown,
  after?: unknown,
): Record<string, unknown> {
  return { workspace: A_FILE, args, golden: tree, expect: "pass", after };
}

/** The arguments of a golden-match-tree vector of the name api, with update. */
function goldenArgs(update: boolean): unknown[] {
  return [string("api"), { type: "bool", value: update }];
}

describe("files", () => {
  describe("CONTRACT", () => {
    it("contains the contract of the call of a files vector", () => {
      expect(CONTRACT).toBe("the files of the vector are as the vector states");
    });
  });

  describe("RUNNERS", () => {
    it("contains a runner of each assertion that reads files", () => {
      expect(Object.keys(RUNNERS).sort()).toEqual([
        "golden-match-tree",
        "has-content",
        "has-mode",
        "is-dir",
        "is-file",
        "links-to",
        "path-absent",
        "tree-contains",
        "tree-equal",
        "tree-unchanged",
      ]);
    });

    const tests: {
      name: string;
      giveKind: string;
      give: Record<string, unknown>;
      want: string;
    }[] = [
      {
        name: "throws the fault of a workspace that is no tree literal",
        giveKind: "path-absent",
        give: { workspace: LIST, args: [string("a.txt")], expect: "pass" },
        want: 'workspace.type: the type "list" is not tree',
      },
      {
        name: "throws the fault of a tree-equal vector that states two trees",
        giveKind: "tree-equal",
        give: { workspace: A_FILE, args: [A_FILE, A_FILE], expect: "pass" },
        want: "args: the number of arguments is 2, want 1",
      },
      {
        name: "throws the fault of a tree-contains argument that is no tree literal",
        giveKind: "tree-contains",
        give: { workspace: A_FILE, args: [LIST], expect: "pass" },
        want: 'args[0].type: the type "list" is not tree',
      },
      {
        name: "throws the fault of a tree-unchanged vector of no subject",
        giveKind: "tree-unchanged",
        give: { workspace: A_FILE, expect: "pass" },
        want: "subject.kind: undefined is no subject of files",
      },
      {
        name: "throws the fault of a tree-unchanged vector of an unknown subject",
        giveKind: "tree-unchanged",
        give: { workspace: A_FILE, subject: { kind: "widget" }, expect: "pass" },
        want: 'subject.kind: "widget" is no subject of files',
      },
      {
        name: "throws the fault of a tree-unchanged vector of a subject that reads no files",
        giveKind: "tree-unchanged",
        give: { workspace: A_FILE, subject: { kind: "returns-ok" }, expect: "pass" },
        want: 'subject.kind: "returns-ok" is no subject of files',
      },
      {
        name: "throws the fault of a golden-match-tree vector that states only the name",
        giveKind: "golden-match-tree",
        give: golden([string("api")], null),
        want: "args: the number of arguments is 1, want 2",
      },
      {
        name: "throws the fault of a golden-match-tree name that is no string",
        giveKind: "golden-match-tree",
        give: golden([ONE, ONE], null),
        want: "args[0]: the argument is no string",
      },
      {
        name: "throws the fault of a golden-match-tree update that is no bool",
        giveKind: "golden-match-tree",
        give: golden([string("api"), ONE], null),
        want: "args[1]: the argument is no bool",
      },
      {
        name: "throws the fault of a golden-match-tree vector in another directory than the working one",
        giveKind: "golden-match-tree",
        give: golden(goldenArgs(false), null),
        want: "the directory of the vector is not the working directory, which golden.matchTree resolves a name against",
      },
      {
        name: "throws the fault of an is-file argument that is no typed literal",
        giveKind: "is-file",
        give: { workspace: A_FILE, args: [{ type: "widget" }], expect: "pass" },
        want: "args[0]: unknown literal type: widget",
      },
      {
        name: "throws the fault of an is-file argument that is a tree literal that misstates its entries",
        giveKind: "is-file",
        give: {
          workspace: A_FILE,
          args: [{ type: "tree", entries: 1 }],
          expect: "pass",
        },
        want: "args[0].entries: the literal states no list of entries",
      },
      {
        name: "throws the fault of a path-absent vector that states no arguments",
        giveKind: "path-absent",
        give: { workspace: A_FILE, expect: "pass" },
        want: "args: the number of arguments is 0, want 1",
      },
      {
        name: "throws the fault of an is-dir path that is no string",
        giveKind: "is-dir",
        give: { workspace: A_FILE, args: [ONE], expect: "pass" },
        want: "args[0]: the argument is no string",
      },
      {
        name: "throws the fault of a links-to target that is no string",
        giveKind: "links-to",
        give: { workspace: A_FILE, args: [string("a.txt"), ONE], expect: "pass" },
        want: "args[1]: the argument is no string",
      },
      {
        name: "throws the fault of a has-content content that is no text and no bytes",
        giveKind: "has-content",
        give: { workspace: A_FILE, args: [string("a.txt"), ONE], expect: "pass" },
        want: "args[1]: the argument is no text and no bytes",
      },
      {
        name: "throws the fault of a has-mode mode that is no integer",
        giveKind: "has-mode",
        give: {
          workspace: A_FILE,
          args: [string("a.txt"), string("rw")],
          expect: "pass",
        },
        want: "args[1]: the argument is no int",
      },
      {
        name: "throws the fault of a vector that expects neither a pass nor a failure",
        giveKind: "path-absent",
        give: { workspace: A_FILE, args: [string("b.txt")], expect: "maybe" },
        want: 'expect: the vector expects "maybe", neither pass nor fail',
      },
      {
        name: "throws the fault of a check that ends with another verdict",
        giveKind: "path-absent",
        give: { workspace: A_FILE, args: [string("a.txt")], expect: "pass" },
        want: "expect: the check ends as fail, want pass",
      },
      {
        name: "throws the fault of a record that states other fields",
        giveKind: "path-absent",
        give: {
          workspace: A_FILE,
          args: [string("a.txt")],
          expect: "fail",
          detail: { got: string("file"), kind: string("file") },
        },
        want: 'detail: the record states the fields ["got"], want ["got","kind"]',
      },
      {
        name: "throws the fault of a field of another value",
        giveKind: "path-absent",
        give: {
          workspace: A_FILE,
          args: [string("a.txt")],
          expect: "fail",
          detail: { got: string("directory") },
        },
        want: 'detail.got: the field is {"type":"string","value":"file"}, want {"type":"string","value":"directory"}',
      },
    ];

    for (const tt of tests) {
      it(tt.name, async () => {
        expect(await faultOf(tt.giveKind, tt.give)).toBe(tt.want);
      });
    }

    it("throws the fault of a check that ends with a fault, with the fault's text", async () => {
      const fault = await faultOf("path-absent", {
        workspace: A_FILE,
        args: [string("n".repeat(300))],
        expect: "pass",
      });

      expect(fault).toMatch(
        /^expect: the check ends as error \(files\.absent: the entry cannot be read: ENAMETOOLONG.*\), want pass$/,
      );
    });

    it("throws the fault of a workspace that cannot be written", async () => {
      const dir = temporary();
      mkdirSync(join(dir, "workspace"));

      expect(
        await faultOf(
          "path-absent",
          { workspace: A_FILE, args: [string("a")], expect: "pass" },
          dir,
        ),
      ).toMatch(/^workspace\.workspace: the entry cannot be written: EEXIST/);
    });

    it.skipIf(UNENFORCED)(
      "throws the fault of a tree-unchanged subject that fails",
      async () => {
        const fault = await faultOf("tree-unchanged", {
          workspace: READ_ONLY_FILE,
          subject: { kind: "rewrites-files" },
          expect: "pass",
        });

        expect(fault).toMatch(/^subject: the subject fails: EACCES/);
      },
    );

    describe("with the vector's directory as the working directory", () => {
      it("throws the fault of a golden tree that is no tree literal", async () => {
        const dir = temporary();
        enter(dir);

        expect(
          await faultOf("golden-match-tree", golden(goldenArgs(false), LIST), dir),
        ).toBe('golden.type: the type "list" is not tree');
      });

      it("throws the fault of a golden tree that cannot be written", async () => {
        const dir = temporary();
        enter(dir);
        writeFileSync(join(dir, "testdata"), "a file");

        expect(
          await faultOf("golden-match-tree", golden(goldenArgs(false), A_FILE), dir),
        ).toMatch(/^golden\.testdata: the entry cannot be written: EEXIST/);
      });

      it("throws the fault of a golden tree after the update that differs from the vector's", async () => {
        const dir = temporary();
        enter(dir);

        expect(
          await faultOf(
            "golden-match-tree",
            golden(goldenArgs(true), null, NO_FILES),
            dir,
          ),
        ).toBe(
          'after: the golden tree is {"type":"tree","entries":[{"path":"a.txt","text":"a"}]}, want {"type":"tree","entries":[]}',
        );
      });

      it("throws the fault of a golden tree that cannot be read after the call", async () => {
        const dir = temporary();
        enter(dir);

        expect(
          await faultOf(
            "golden-match-tree",
            golden(goldenArgs(false), null, NO_FILES),
            dir,
          ),
        ).toMatch(
          /^after: the golden tree cannot be read: the tree cannot be read: ENOENT/,
        );
      });
    });
  });
});
