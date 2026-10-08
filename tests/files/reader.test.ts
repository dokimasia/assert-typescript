/** The spec of the reader of a tree and of the entry at one path. */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { bytes, directory, executable, link, text } from "../../src/files/entry.js";
import { kindOfStats, readPath, readTree } from "../../src/files/reader.js";
import { treeOf } from "../../src/files/tree.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import {
  LONG_NAMES_ABSENT,
  temporary,
  thrown,
  UNENFORCED,
  WINDOWS,
} from "../helpers.js";

/** Writes the file at path with content, and gives it mode. */
function file(path: string, content: string | Uint8Array, mode = 0o644): void {
  writeFileSync(path, content);
  chmodSync(path, mode);
}

/** Creates the directory at path, and gives it mode. */
function folder(path: string, mode = 0o755): void {
  mkdirSync(path);
  chmodSync(path, mode);
}

/** Returns a directory with a file, an executable script, a directory with a mode, and a link. */
function fixture(): string {
  const dir = temporary();
  file(join(dir, "a.txt"), "a\n");
  file(join(dir, "run.sh"), "#!/bin/sh\n", 0o755);
  folder(join(dir, "keys"), 0o700);
  file(join(dir, "keys", "id"), Uint8Array.of(0x89, 0x50), 0o600);
  symlinkSync("a.txt", join(dir, "current"));
  return dir;
}

/** Creates a pipe at path, an entry that is no file, directory or link. */
function pipe(path: string): void {
  execFileSync("mkfifo", [path]);
}

describe("reader", () => {
  describe("kindOfStats", () => {
    it("returns file for a file", ({ seat }) => {
      const dir = fixture();

      check.equal(seat, kindOfStats(lstatSync(join(dir, "a.txt"))), "file", "the kind");
    });

    it("returns directory for a directory", ({ seat }) => {
      check.equal(seat, kindOfStats(lstatSync(fixture())), "directory", "the kind");
    });

    it("returns link for a link", ({ seat }) => {
      const dir = fixture();

      check.equal(
        seat,
        kindOfStats(lstatSync(join(dir, "current"))),
        "link",
        "the kind",
      );
    });

    it.skipIf(WINDOWS)("returns undefined for a device", ({ seat }) => {
      check.isNil(
        seat,
        kindOfStats(statSync("/dev/null")),
        "a device is no entry of a tree",
      );
    });
  });

  describe("readTree", () => {
    it.skipIf(WINDOWS)("returns every entry with its mode", ({ seat }) => {
      check.equal(
        seat,
        treeOf(readTree(fixture(), true)),
        {
          "a.txt": text("a\n").withMode(0o644),
          current: link("a.txt"),
          keys: directory().withMode(0o700),
          "keys/id": bytes(Uint8Array.of(0x89, 0x50)).withMode(0o600),
          "run.sh": text("#!/bin/sh\n").withMode(0o755),
        },
        "the tree",
      );
    });

    it.skipIf(WINDOWS)(
      "returns the owner's execute bit of each file alone without modes",
      ({ seat }) => {
        check.equal(
          seat,
          treeOf(readTree(fixture(), false)),
          {
            "a.txt": text("a\n"),
            current: link("a.txt"),
            keys: directory(),
            "keys/id": bytes(Uint8Array.of(0x89, 0x50)),
            "run.sh": executable("#!/bin/sh\n"),
          },
          "the tree",
        );
      },
    );

    it("reads the tree of a root that is a link to a directory", ({ seat }) => {
      const dir = fixture();
      const root = join(temporary(), "root");
      symlinkSync(dir, root);

      check.equal(
        seat,
        [...readTree(root, false).keys()].sort(),
        ["a.txt", "current", "keys", "keys/id", "run.sh"],
        "the paths",
      );
    });

    it("throws the fault of a root that is missing", ({ seat }) => {
      check.hasPrefix(
        seat,
        thrown(() => readTree(join(temporary(), "missing"), true)),
        "the tree cannot be read: ENOENT",
        "the fault",
      );
    });

    it("throws the fault of a root that is no directory", ({ seat }) => {
      const dir = fixture();

      check.equal(
        seat,
        thrown(() => readTree(join(dir, "a.txt"), true)),
        "the root of the tree is no directory",
        "the fault",
      );
    });

    it.skipIf(UNENFORCED)(
      "throws the fault of a directory that cannot be read",
      ({ seat }) => {
        const dir = temporary();
        folder(join(dir, "sealed"), 0o300);

        check.hasPrefix(
          seat,
          thrown(() => readTree(dir, true)),
          "sealed: the tree cannot be read: EACCES",
          "the fault",
        );
      },
    );

    it.skipIf(UNENFORCED)(
      "throws the fault of a file that cannot be read",
      ({ seat }) => {
        const dir = temporary();
        file(join(dir, "secret"), "s", 0o000);

        check.hasPrefix(
          seat,
          thrown(() => readTree(dir, true)),
          "secret: the entry cannot be read: EACCES",
          "the fault",
        );
      },
    );

    it.skipIf(WINDOWS)(
      "throws the fault of an entry that is no file, directory or link",
      ({ seat }) => {
        const dir = temporary();
        folder(join(dir, "run"));
        pipe(join(dir, "run", "fifo"));

        check.equal(
          seat,
          thrown(() => readTree(dir, true)),
          "run/fifo: the entry is no file, directory or link",
          "the fault",
        );
      },
    );
  });

  describe("readPath", () => {
    it.skipIf(WINDOWS)("returns a file with its content and its mode", ({ seat }) => {
      const dir = fixture();

      check.equal(
        seat,
        readPath(join(dir, "a.txt"), true),
        text("a\n").withMode(0o644),
        "the file",
      );
    });

    it.skipIf(WINDOWS)(
      "returns a file without its content when it reads none",
      ({ seat }) => {
        const dir = fixture();

        check.equal(
          seat,
          readPath(join(dir, "a.txt"), false),
          text("").withMode(0o644),
          "the file",
        );
      },
    );

    it("returns the link at a path, and follows it not", ({ seat }) => {
      const dir = fixture();

      check.equal(
        seat,
        readPath(join(dir, "current"), true),
        link("a.txt"),
        "the link",
      );
    });

    it("returns undefined for a path where nothing is", ({ seat }) => {
      check.isNil(seat, readPath(join(fixture(), "b.txt"), true), "nothing is there");
    });

    it("returns undefined for a path below a file", ({ seat }) => {
      check.isNil(
        seat,
        readPath(join(fixture(), "a.txt", "b"), true),
        "nothing is there",
      );
    });

    it.skipIf(LONG_NAMES_ABSENT)(
      "throws the fault of a path that the file system refuses",
      ({ seat }) => {
        check.hasPrefix(
          seat,
          thrown(() => readPath(join(temporary(), "n".repeat(300)), true)),
          "the entry cannot be read: ENAMETOOLONG",
          "the fault",
        );
      },
    );

    it.skipIf(WINDOWS)(
      "throws the fault of an entry that is no file, directory or link",
      ({ seat }) => {
        check.equal(
          seat,
          thrown(() => readPath("/dev/null", true)),
          "the entry is no file, directory or link",
          "the fault",
        );
      },
    );

    it.skipIf(UNENFORCED)(
      "throws the fault of a file that cannot be read",
      ({ seat }) => {
        const dir = temporary();
        file(join(dir, "secret"), "s", 0o000);

        check.hasPrefix(
          seat,
          thrown(() => readPath(join(dir, "secret"), true)),
          "the entry cannot be read: EACCES",
          "the fault",
        );
      },
    );
  });
});
