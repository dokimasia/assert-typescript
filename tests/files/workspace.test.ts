/** The spec of the workspace of a test. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, onTestFinished } from "vitest";
import { directory, Entry, text } from "../../src/files/entry.js";
import { workspace } from "../../src/files/workspace.js";
import { check } from "../../src/index.js";
import type { Cleanups } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { temporary, WINDOWS } from "../helpers.js";

/** A recorder that keeps the cleanups that it receives, which a test runs itself. */
class Cleaning extends Recorder implements Cleanups {
  /** The cleanups, in the order of their registration. */
  readonly cleanups: (() => void)[] = [];

  cleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /** Runs the cleanups, the last registered first. */
  end(): void {
    for (const fn of [...this.cleanups].reverse()) fn();
  }
}

describe("workspace", () => {
  describe("workspace", () => {
    it("returns a directory of the test's own that contains the tree", ({ seat }) => {
      const dir = workspace(seat, { "docs/a.md": text("# a\n") });

      check.hasPrefix(seat, dir, join(tmpdir(), "dokimi-files-"), "the directory");
      check.equal(
        seat,
        readFileSync(join(dir, "docs", "a.md"), "utf8"),
        "# a\n",
        "the file",
      );
    });

    it("registers the removal of its directory with the seat", ({ seat }) => {
      const cleaning = new Cleaning();
      const dir = workspace(cleaning, { "a.txt": text("a") });
      cleaning.end();

      check.isFalse(seat, existsSync(dir), "the directory is removed");
    });

    it.skipIf(WINDOWS)(
      "removes a directory whose mode forbids the owner to write it",
      ({ seat }) => {
        const cleaning = new Cleaning();
        const dir = workspace(cleaning, {
          sealed: directory().withMode(0o500),
          "sealed/a.txt": text("a"),
        });
        cleaning.end();

        check.isFalse(seat, existsSync(dir), "the directory is removed");
      },
    );

    it("ends the call with a fault for a tree that breaks a rule, before it writes anything", ({
      seat,
    }) => {
      const cleaning = new Cleaning();
      const dir = workspace(cleaning, { "a.txt": text("a"), b: new Entry() });
      onTestFinished(() => cleaning.end());

      check.equal(
        seat,
        [cleaning.message, readdirSync(dir)],
        ["files.workspace: b: the entry states no file, directory or link", []],
        "nothing is written",
      );
    });

    it.skipIf(WINDOWS)(
      "ends the call with a fault when no directory can be created",
      ({ seat }) => {
        const before = process.env["TMPDIR"];
        process.env["TMPDIR"] = join(temporary(), "missing");
        onTestFinished(() => {
          if (before === undefined) Reflect.deleteProperty(process.env, "TMPDIR");
          else process.env["TMPDIR"] = before;
        });
        const cleaning = new Cleaning();
        const dir = workspace(cleaning, {});

        check.equal(seat, dir, "", "no directory");
        check.hasPrefix(seat, cleaning.message, "files.workspace: ENOENT", "the fault");
      },
    );
  });
});
