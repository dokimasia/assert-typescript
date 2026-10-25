// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the behaviours of a corpus case that read or write the files of a tree. */

import { join } from "node:path";
import { describe } from "vitest";
import {
  leavesFilesAlone,
  rewritesFiles,
  writesFile,
} from "../../../src/conformance/subject/files.js";
import type { Subject } from "../../../src/conformance/subject.js";
import { check, files } from "../../../src/index.js";
import { test as it } from "../../../src/vitest.js";
import { UNENFORCED } from "../../helpers.js";

/** Calls the files shape of subject on the tree in dir. */
function touch(subject: Subject, dir: string): void {
  (subject.files as (dir: string) => void)(dir);
}

describe("files", () => {
  describe("leavesFilesAlone", () => {
    it.skipIf(UNENFORCED)("returns a subject that reads every file", ({ seat }) => {
      const dir = files.workspace(seat, {
        "docs/a.md": files.text("a").withMode(0o000),
      });

      check.doesThrow(
        seat,
        () => touch(leavesFilesAlone(), dir),
        "the unreadable file is read",
      );
    });

    it("returns a subject that writes nothing", async ({ seat }) => {
      const dir = files.workspace(seat, {
        "a.txt": files.text("a"),
        b: files.link("a.txt"),
      });

      await files.unchanged(
        seat,
        dir,
        () => touch(leavesFilesAlone(), dir),
        "the tree",
      );
    });
  });

  describe("rewritesFiles", () => {
    it.skipIf(UNENFORCED)("returns a subject that writes every file", ({ seat }) => {
      const dir = files.workspace(seat, {
        "docs/a.md": files.text("a").withMode(0o400),
      });

      check.doesThrow(
        seat,
        () => touch(rewritesFiles(), dir),
        "the read-only file is written",
      );
    });

    it.skipIf(UNENFORCED)("returns a subject that follows no link", ({ seat }) => {
      const outside = files.workspace(seat, {
        "a.txt": files.text("a").withMode(0o400),
      });
      const dir = files.workspace(seat, { b: files.link(join(outside, "a.txt")) });

      check.doesNotThrow(
        seat,
        () => touch(rewritesFiles(), dir),
        "the link is not followed",
      );
    });

    it("returns a subject that writes the bytes that each file has", async ({
      seat,
    }) => {
      const dir = files.workspace(seat, {
        "a.txt": files.text("a"),
        "keys/id": files.text("s"),
      });

      await files.unchanged(seat, dir, () => touch(rewritesFiles(), dir), "the tree");
    });
  });

  describe("writesFile", () => {
    it("returns a subject that writes the content at the name", ({ seat }) => {
      const dir = files.workspace(seat, {});
      touch(writesFile("new.txt", "new"), dir);

      files.hasContent(seat, join(dir, "new.txt"), "new", "the file is written");
    });
  });
});
