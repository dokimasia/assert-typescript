/** The spec of the writer of a tree into a directory. */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { directory, executable, link, text } from "../../src/files/entry.js";
import {
  create,
  DIRECTORY_MODE,
  EXECUTABLE_MODE,
  FILE_MODE,
  modeOf,
  overwrite,
  unlock,
  update,
} from "../../src/files/writer.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import {
  LONG_NAMES_ABSENT,
  temporary,
  thrown,
  UMASKS,
  UNENFORCED,
  umask,
  WINDOWS,
} from "../helpers.js";

/** Returns the permission bits of the entry at path. */
function modeAt(path: string): number {
  return lstatSync(path).mode & 0o777;
}

/** Returns the names in dir, sorted. */
function names(dir: string): string[] {
  return readdirSync(dir).sort();
}

describe("writer", () => {
  describe("FILE_MODE", () => {
    it("contains 0o644", ({ seat }) => {
      check.equal(seat, FILE_MODE, 0o644, "the mode of a file");
    });
  });

  describe("EXECUTABLE_MODE", () => {
    it("contains 0o755", ({ seat }) => {
      check.equal(seat, EXECUTABLE_MODE, 0o755, "the mode of an executable file");
    });
  });

  describe("DIRECTORY_MODE", () => {
    it("contains 0o755", ({ seat }) => {
      check.equal(seat, DIRECTORY_MODE, 0o755, "the mode of a directory");
    });
  });

  describe("modeOf", () => {
    const tests = [
      { name: "returns the stated mode", give: text("a").withMode(0o600), want: 0o600 },
      { name: "returns 0o755 for a directory", give: directory(), want: 0o755 },
      {
        name: "returns 0o755 for an executable file",
        give: executable("a"),
        want: 0o755,
      },
      { name: "returns 0o644 for a file", give: text("a"), want: 0o644 },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, modeOf(tt.give), tt.want, "the mode");
      });
    }
  });

  describe("create", () => {
    it("writes a file, a directory and a link", ({ seat }) => {
      const dir = temporary();
      create(
        dir,
        new Map([
          ["docs/a.md", text("# a\n")],
          ["empty", directory()],
          ["current", link("docs/a.md")],
        ]),
      );

      check.equal(
        seat,
        [
          readFileSync(join(dir, "docs", "a.md"), "utf8"),
          names(join(dir, "empty")),
          readlinkSync(join(dir, "current")),
        ],
        ["# a\n", [], join("docs", "a.md")],
        "the entries are written",
      );
    });

    for (const mask of UMASKS) {
      it.skipIf(WINDOWS)(
        `sets the modes that the tree states under the umask 0o${mask.toString(8)}`,
        ({ seat }) => {
          umask(mask);
          const dir = temporary();
          create(
            dir,
            new Map([
              ["notes.txt", text("n")],
              ["bin/run", executable("r")],
              ["keys", directory().withMode(0o700)],
              ["keys/id", text("s").withMode(0o600)],
            ]),
          );

          check.equal(
            seat,
            ["notes.txt", "bin", "bin/run", "keys", "keys/id"].map((p) =>
              modeAt(join(dir, p)),
            ),
            [0o644, 0o755, 0o755, 0o700, 0o600],
            "the umask changes no mode",
          );
        },
      );
    }

    it.skipIf(WINDOWS)(
      "writes below a directory whose mode forbids writes",
      ({ seat }) => {
        const dir = temporary();
        create(
          dir,
          new Map([
            ["sealed", directory().withMode(0o500)],
            ["sealed/a.txt", text("a")],
          ]),
        );

        check.equal(
          seat,
          [
            modeAt(join(dir, "sealed")),
            readFileSync(join(dir, "sealed", "a.txt"), "utf8"),
          ],
          [0o500, "a"],
          "the mode is set after the entry below it",
        );
      },
    );

    it("throws the fault of a tree that breaks a rule before it writes anything", ({
      seat,
    }) => {
      const dir = temporary();
      const fault = thrown(() =>
        create(
          dir,
          new Map([
            ["a.txt", text("a")],
            ["b//c", text("c")],
          ]),
        ),
      );

      check.equal(
        seat,
        [fault, names(dir)],
        ['b//c: the path "b//c" has the name ""', []],
        "nothing is written",
      );
    });

    it("throws the fault of a directory that cannot be opened", ({ seat }) => {
      check.hasPrefix(
        seat,
        thrown(() => create(join(temporary(), "missing"), new Map([["a", text("a")]]))),
        "the directory cannot be opened: ENOENT",
        "the fault",
      );
    });

    it("throws the fault of an entry that is there, and writes over none", ({
      seat,
    }) => {
      const dir = temporary();
      writeFileSync(join(dir, "a.txt"), "old");
      const fault = thrown(() => create(dir, new Map([["a.txt", text("new")]])));

      check.hasPrefix(
        seat,
        fault,
        "a.txt: the entry cannot be written: EEXIST",
        "the fault",
      );
      check.equal(
        seat,
        readFileSync(join(dir, "a.txt"), "utf8"),
        "old",
        "the file is kept",
      );
    });
  });

  describe("overwrite", () => {
    it("replaces the content of a file that its owner may not write", ({ seat }) => {
      const dir = temporary();
      writeFileSync(join(dir, "a.txt"), "old");
      chmodSync(join(dir, "a.txt"), 0o400);
      overwrite(dir, new Map([["a.txt", text("new")]]));

      check.equal(
        seat,
        readFileSync(join(dir, "a.txt"), "utf8"),
        "new",
        "the content is replaced",
      );
    });

    it.skipIf(WINDOWS)(
      "sets the mode that the tree states, or the mode of a file",
      ({ seat }) => {
        const dir = temporary();
        writeFileSync(join(dir, "a.txt"), "old");
        writeFileSync(join(dir, "b.txt"), "old");
        chmodSync(join(dir, "a.txt"), 0o600);
        chmodSync(join(dir, "b.txt"), 0o600);
        overwrite(
          dir,
          new Map([
            ["a.txt", text("a")],
            ["b.txt", text("b").withMode(0o640)],
          ]),
        );

        check.equal(
          seat,
          [modeAt(join(dir, "a.txt")), modeAt(join(dir, "b.txt"))],
          [0o644, 0o640],
          "the modes",
        );
      },
    );

    it("replaces the target of a link", ({ seat }) => {
      const dir = temporary();
      symlinkSync("a.txt", join(dir, "current"));
      overwrite(dir, new Map([["current", link("b.txt")]]));

      check.equal(seat, readlinkSync(join(dir, "current")), "b.txt", "the target");
    });

    it("keeps the entries of a directory and every entry that the tree does not state", ({
      seat,
    }) => {
      const dir = temporary();
      mkdirSync(join(dir, "docs"));
      writeFileSync(join(dir, "docs", "kept.md"), "kept");
      writeFileSync(join(dir, "other.txt"), "other");
      overwrite(dir, new Map([["docs/new.md", text("new")]]));

      check.equal(
        seat,
        [names(join(dir, "docs")), readFileSync(join(dir, "other.txt"), "utf8")],
        [["kept.md", "new.md"], "other"],
        "the other entries are kept",
      );
    });

    it.skipIf(WINDOWS)(
      "keeps the mode of a parent that the tree implies",
      ({ seat }) => {
        const dir = temporary();
        mkdirSync(join(dir, "docs"));
        chmodSync(join(dir, "docs"), 0o750);
        overwrite(dir, new Map([["docs/a.md", text("a")]]));

        check.equal(seat, modeAt(join(dir, "docs")), 0o750, "the mode is kept");
      },
    );

    it.skipIf(WINDOWS)(
      "sets the mode of a directory that the tree states",
      ({ seat }) => {
        const dir = temporary();
        mkdirSync(join(dir, "keys"));
        overwrite(dir, new Map([["keys", directory().withMode(0o700)]]));

        check.equal(seat, modeAt(join(dir, "keys")), 0o700, "the mode is set");
      },
    );

    it.skipIf(WINDOWS)(
      "gives a directory that it creates the mode of a directory",
      ({ seat }) => {
        const dir = temporary();
        overwrite(dir, new Map([["a/b.txt", text("b")]]));

        check.equal(seat, modeAt(join(dir, "a")), 0o755, "the created parent's mode");
      },
    );

    const refusals = [
      {
        name: "throws the fault of a file where the tree states a directory",
        give: (dir: string) => writeFileSync(join(dir, "docs"), "a file"),
        tree: new Map([["docs/a.md", text("a")]]),
        want: "docs: the entry is a file, and the tree states a directory",
      },
      {
        name: "throws the fault of a link where the tree states a directory",
        give: (dir: string) => {
          mkdirSync(join(dir, "real"));
          symlinkSync("real", join(dir, "docs"));
        },
        tree: new Map([["docs/a.md", text("a")]]),
        want: "docs: the entry is a link, and the tree states a directory",
      },
      {
        name: "throws the fault of a second name of a file of the tree",
        give: (dir: string) => {
          writeFileSync(join(dir, "a.txt"), "a");
          linkSync(join(dir, "a.txt"), join(dir, "b.txt"));
        },
        tree: new Map([
          ["a.txt", text("x")],
          ["b.txt", text("y")],
        ]),
        want: 'b.txt: the file system maps the path to the entry at "a.txt"',
      },
    ];

    for (const tt of refusals) {
      it(tt.name, ({ seat }) => {
        const dir = temporary();
        tt.give(dir);
        const before = names(dir);

        check.equal(
          seat,
          [thrown(() => overwrite(dir, tt.tree)), names(dir)],
          [tt.want, before],
          "nothing is written",
        );
      });
    }

    it.skipIf(WINDOWS)(
      "throws the fault of an entry that is no file, directory or link",
      ({ seat }) => {
        const dir = temporary();
        execFileSync("mkfifo", [join(dir, "fifo")]);

        check.equal(
          seat,
          thrown(() => overwrite(dir, new Map([["fifo", text("a")]]))),
          "fifo: the entry is no file, directory or link",
          "the fault",
        );
      },
    );

    it.skipIf(LONG_NAMES_ABSENT)(
      "throws the fault of an entry that cannot be read",
      ({ seat }) => {
        const name = "n".repeat(300);

        check.hasPrefix(
          seat,
          thrown(() => overwrite(temporary(), new Map([[name, text("a")]]))),
          `${name}: the entry cannot be read: ENAMETOOLONG`,
          "the fault",
        );
      },
    );

    it.skipIf(UNENFORCED)(
      "throws the fault of an entry that cannot be written",
      ({ seat }) => {
        const dir = temporary();
        mkdirSync(join(dir, "sealed"));
        chmodSync(join(dir, "sealed"), 0o500);

        check.hasPrefix(
          seat,
          thrown(() => overwrite(dir, new Map([["sealed/a.txt", text("a")]]))),
          "sealed/a.txt: the entry cannot be written: EACCES",
          "the fault",
        );
      },
    );

    it("throws the fault of a directory that is a file", ({ seat }) => {
      const dir = temporary();
      writeFileSync(join(dir, "file"), "a");

      check.hasPrefix(
        seat,
        thrown(() => overwrite(join(dir, "file"), new Map([["a", text("a")]]))),
        "the directory cannot be opened: ENOTDIR",
        "the fault",
      );
    });

    it("throws the fault of a tree that breaks a rule", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => overwrite(temporary(), new Map([["a/../b", text("a")]]))),
        'a/../b: the path "a/../b" has the name ".."',
        "the fault",
      );
    });
  });

  describe("update", () => {
    it("creates a missing directory and writes the tree", ({ seat }) => {
      const dir = join(temporary(), "golden", "api");
      update(dir, new Map([["v1/types.go", text("package v1\n")]]));

      check.equal(
        seat,
        readFileSync(join(dir, "v1", "types.go"), "utf8"),
        "package v1\n",
        "the tree is written",
      );
    });

    it("removes each entry that the tree lacks, and a link without its target", ({
      seat,
    }) => {
      const dir = temporary();
      mkdirSync(join(dir, "old"));
      writeFileSync(join(dir, "old", "stale.go"), "stale");
      writeFileSync(join(dir, "api.go"), "api");
      const target = join(temporary(), "target.txt");
      writeFileSync(target, "kept");
      symlinkSync(target, join(dir, "latest"));
      update(dir, new Map([["api.go", text("api")]]));

      check.equal(
        seat,
        [names(dir), readFileSync(target, "utf8")],
        [["api.go"], "kept"],
        "the extra entries are removed",
      );
    });

    it("rewrites an entry of another form, and keeps an equal one", ({ seat }) => {
      const dir = temporary();
      writeFileSync(join(dir, "a.txt"), "old");
      writeFileSync(join(dir, "b.txt"), "same");
      const kept = statSync(join(dir, "b.txt")).ino;
      update(
        dir,
        new Map([
          ["a.txt", text("new")],
          ["b.txt", text("same")],
        ]),
      );

      check.equal(
        seat,
        [readFileSync(join(dir, "a.txt"), "utf8"), statSync(join(dir, "b.txt")).ino],
        ["new", kept],
        "the equal file is the same file",
      );
    });

    it.skipIf(WINDOWS)("writes the mode of an entry that states none", ({ seat }) => {
      const dir = temporary();
      update(
        dir,
        new Map([
          ["key", text("s").withMode(0o600)],
          ["run.sh", executable("r")],
        ]),
      );

      check.equal(
        seat,
        [modeAt(join(dir, "key")), modeAt(join(dir, "run.sh"))],
        [0o644, 0o755],
        "the modes",
      );
    });

    it("throws the fault of a directory that cannot be created", ({ seat }) => {
      const dir = temporary();
      writeFileSync(join(dir, "file"), "a");

      check.hasPrefix(
        seat,
        thrown(() => update(join(dir, "file", "golden"), new Map([["a", text("a")]]))),
        "the directory cannot be created: ENOTDIR",
        "the fault",
      );
    });

    it("throws the fault of a tree that breaks a rule", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => update(temporary(), new Map([["", text("a")]]))),
        'the path "" has the name ""',
        "the fault",
      );
    });
  });

  describe("unlock", () => {
    it.skipIf(WINDOWS)(
      "gives the owner every permission of each directory below it",
      ({ seat }) => {
        const dir = temporary();
        mkdirSync(join(dir, "a"));
        mkdirSync(join(dir, "a", "b"));
        writeFileSync(join(dir, "a", "f.txt"), "f");
        chmodSync(join(dir, "a", "f.txt"), 0o400);
        chmodSync(join(dir, "a", "b"), 0o000);
        chmodSync(join(dir, "a"), 0o500);
        unlock(dir);

        check.equal(
          seat,
          [
            modeAt(join(dir, "a")),
            modeAt(join(dir, "a", "b")),
            modeAt(join(dir, "a", "f.txt")),
          ],
          [0o700, 0o700, 0o400],
          "the directories are open, and the file is as it was",
        );
      },
    );

    it("changes nothing at a path where nothing is", ({ seat }) => {
      const dir = temporary();
      unlock(join(dir, "missing"));

      check.isEmpty(seat, names(dir), "nothing is created");
    });
  });
});
