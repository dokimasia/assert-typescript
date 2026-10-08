/** The spec of the tree literal of the definition. */

import { describe } from "vitest";
import { bytes, directory, executable, link, text } from "../../src/files/entry.js";
import { CONTENT_LIMIT, decode, encode } from "../../src/files/literal.js";
import { treeOf } from "../../src/files/tree.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** Returns a tree literal of entries. */
function literal(...entries: unknown[]): { type: string; entries: unknown[] } {
  return { type: "tree", entries };
}

describe("literal", () => {
  describe("CONTENT_LIMIT", () => {
    it("contains 65,536 bytes", ({ seat }) => {
      check.equal(seat, CONTENT_LIMIT, 65_536, "the limit");
    });
  });

  describe("encode", () => {
    it("returns the literal of every kind of entry, in path order", ({ seat }) => {
      const tree = new Map([
        ["logo.png", bytes(Uint8Array.of(0x89, 0x50))],
        ["bin/run", executable("#!/bin/sh\n")],
        ["cache", directory()],
        ["current", link("bin/run")],
        ["keys/id", text("secret\n").withMode(0o600)],
      ]);

      check.equal(
        seat,
        encode(tree, CONTENT_LIMIT),
        literal(
          { path: "bin/run", text: "#!/bin/sh\n", executable: true },
          { path: "cache", directory: true },
          { path: "current", link: "bin/run" },
          { path: "keys/id", text: "secret\n", mode: 0o600 },
          { path: "logo.png", bytes: "8950" },
        ),
        "the literal",
      );
    });

    it("states a file longer than the limit by its digest and its size", ({ seat }) => {
      check.equal(
        seat,
        encode(new Map([["a.txt", text("abc")]]), 2),
        literal({
          path: "a.txt",
          digest:
            "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
          size: 3,
        }),
        "the digest of abc",
      );
    });

    it("states a file as long as the limit in full", ({ seat }) => {
      check.equal(
        seat,
        encode(new Map([["a.txt", text("abc")]]), 3),
        literal({ path: "a.txt", text: "abc" }),
        "the text",
      );
    });
  });

  describe("decode", () => {
    it("returns the tree of every kind of entry", ({ seat }) => {
      const tree = decode(
        literal(
          { path: "bin/run", text: "#!/bin/sh\n", executable: true },
          { path: "cache", directory: true, mode: 0o700 },
          { path: "current", link: "bin/run" },
          { path: "keys/id", text: "secret\n", mode: 0o600 },
          { path: "logo.png", bytes: "8950", executable: true },
          { path: "notes.txt", text: "notes\n", executable: false },
        ),
      );

      check.equal(
        seat,
        treeOf(tree),
        {
          "bin/run": executable("#!/bin/sh\n"),
          cache: directory().withMode(0o700),
          current: link("bin/run"),
          "keys/id": text("secret\n").withMode(0o600),
          "logo.png": Object.assign(bytes(Uint8Array.of(0x89, 0x50)), {
            executable: true,
          }),
          "notes.txt": text("notes\n"),
        },
        "the tree",
      );
    });

    it("returns a file of bytes that are UTF-8 text as text", ({ seat }) => {
      check.equal(
        seat,
        treeOf(decode(literal({ path: "a.txt", bytes: "610a" }))),
        { "a.txt": text("a\n") },
        "the bytes are text",
      );
    });

    const tests = [
      {
        name: "throws the fault of a literal that is no object",
        give: [] as unknown,
        want: "the literal is no object",
      },
      {
        name: "throws the fault of a literal of another type",
        give: { type: "list" },
        want: 'type: the type "list" is not tree',
      },
      {
        name: "throws the fault of a literal without a list of entries",
        give: { type: "tree" },
        want: "entries: the literal states no list of entries",
      },
      {
        name: "throws the fault of an entry that is no object",
        give: literal(null),
        want: "entries[0]: the entry is no object",
      },
      {
        name: "throws the fault of an entry of two kinds",
        give: literal({ path: "a", text: "a", link: "b" }),
        want: "entries[0]: the entry states [text link], and an entry states one of text, bytes, directory and link",
      },
      {
        name: "throws the fault of an entry of no kind",
        give: literal({ path: "a" }),
        want: "entries[0]: the entry states [], and an entry states one of text, bytes, directory and link",
      },
      {
        name: "throws the fault of a member that the kind takes no",
        give: literal({ path: "a", link: "b", mode: 0o644 }),
        want: "entries[0].mode: a link entry takes no mode",
      },
      {
        name: "throws the fault of a path that is no string",
        give: literal({ path: 1, text: "a" }),
        want: "entries[0].path: the path is no string",
      },
      {
        name: "throws the fault of a digest, which no input states",
        give: literal({ path: "a", digest: "sha256:00", size: 1 }),
        want: "entries[0].digest: a digest states no content, and only a record states one",
      },
      {
        name: "throws the fault of a directory that is not true",
        give: literal({ path: "a", directory: false }),
        want: "entries[0].directory: directory is not true",
      },
      {
        name: "throws the fault of a link that is no string",
        give: literal({ path: "a", link: 1 }),
        want: "entries[0].link: the link is no string",
      },
      {
        name: "throws the fault of bytes in uppercase",
        give: literal({ path: "a", bytes: "AB" }),
        want: 'entries[0].bytes: "AB" is no lowercase hexadecimal',
      },
      {
        name: "throws the fault of bytes of an odd number of digits",
        give: literal({ path: "a", bytes: "abc" }),
        want: 'entries[0].bytes: "abc" is no lowercase hexadecimal',
      },
      {
        name: "throws the fault of a text that is no string",
        give: literal({ path: "a", text: 1 }),
        want: "entries[0].text: the text is no string",
      },
      {
        name: "throws the fault of a text that is no UTF-8 text",
        give: literal({ path: "a", text: "\ud800" }),
        want: "entries[0].text: the text is no UTF-8 text",
      },
      {
        name: "throws the fault of an entry that states a mode and executable",
        give: literal({ path: "a", text: "a", executable: true, mode: 0o755 }),
        want: "entries[0]: the entry states a mode and executable, and the mode states the execute bit",
      },
      {
        name: "throws the fault of executable that is no boolean",
        give: literal({ path: "a", text: "a", executable: "yes" }),
        want: "entries[0].executable: executable is no boolean",
      },
      {
        name: "throws the fault of a mode that is no number",
        give: literal({ path: "a", text: "a", mode: "rw" }),
        want: 'entries[0].mode: the mode "rw" is no integer from 0 to 511',
      },
      {
        name: "throws the fault of a mode beyond the nine permission bits",
        give: literal({ path: "a", text: "a", mode: 512 }),
        want: "entries[0].mode: the mode 512 is no integer from 0 to 511",
      },
      {
        name: "throws the fault of a path that repeats the path before it",
        give: literal({ path: "a", text: "a" }, { path: "a", text: "b" }),
        want: 'entries[1]: the path "a" is not after the path before it',
      },
      {
        name: "throws the fault of a path before the path before it",
        give: literal({ path: "b", text: "b" }, { path: "a", text: "a" }),
        want: 'entries[1]: the path "a" is not after the path before it',
      },
      {
        name: "throws the fault of a tree that breaks a rule of a tree",
        give: literal({ path: "a", text: "a" }, { path: "a/b", text: "b" }),
        want: 'a/b: the entry is below "a", which is a file',
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => decode(tt.give)),
          tt.want,
          "the fault",
        );
      });
    }
  });
});
