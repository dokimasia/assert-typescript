/** The spec of the read of the content of one file. */

import { join } from "node:path";
import { describe } from "vitest";
import { directory, link, text } from "../../src/files/entry.js";
import { read } from "../../src/files/read.js";
import { workspace } from "../../src/files/workspace.js";
import { check } from "../../src/index.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { LONG_NAMES_ABSENT } from "../helpers.js";

describe("read", () => {
  describe("read", () => {
    it("returns the content of the file at the path", ({ seat }) => {
      const dir = workspace(seat, { "go.mod": text("module example.com/a\n") });

      check.equal(
        seat,
        read(seat, join(dir, "go.mod")),
        "module example.com/a\n",
        "the content",
      );
    });

    const tests = [
      { name: "ends the call with a fault where nothing is", give: "missing.txt" },
      { name: "ends the call with a fault for a directory", give: "docs" },
      { name: "ends the call with a fault for a link to a file", give: "current" },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        const dir = workspace(seat, {
          "a.txt": text("a"),
          docs: directory(),
          current: link("a.txt"),
        });
        const path = join(dir, tt.give);
        const recorder = new Recorder();
        const content = read(recorder, path);

        check.equal(
          seat,
          [content, recorder.message],
          ["", `files.read: no file is at the path ${JSON.stringify(path)}`],
          "the fault",
        );
      });
    }

    it.skipIf(LONG_NAMES_ABSENT)(
      "ends the call with a fault for a path that the file system refuses",
      ({ seat }) => {
        const dir = workspace(seat, {});
        const recorder = new Recorder();
        read(recorder, join(dir, "n".repeat(300)));

        check.hasPrefix(
          seat,
          recorder.message,
          "files.read: the entry cannot be read: ENAMETOOLONG",
          "the fault",
        );
      },
    );
  });
});
