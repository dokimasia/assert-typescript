/** The spec of the write of a tree over a directory that exists. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { text } from "../../src/files/entry.js";
import { workspace } from "../../src/files/workspace.js";
import { write } from "../../src/files/write.js";
import { check } from "../../src/index.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";

describe("write", () => {
  describe("write", () => {
    it("writes the tree over the entries of the directory", ({ seat }) => {
      const dir = workspace(seat, {
        "api/store.gen.go": text("generated"),
        "kept.txt": text("k"),
      });
      write(seat, dir, { "api/store.gen.go": text("edited") });

      check.equal(
        seat,
        [
          readFileSync(join(dir, "api", "store.gen.go"), "utf8"),
          readFileSync(join(dir, "kept.txt"), "utf8"),
        ],
        ["edited", "k"],
        "the file is edited and the other file is kept",
      );
    });

    it("ends the call with a fault for an entry of another kind", ({ seat }) => {
      const dir = workspace(seat, { docs: text("a file") });
      const recorder = new Recorder();
      write(recorder, dir, { "docs/a.md": text("a") });

      check.equal(
        seat,
        recorder.message,
        "files.write: docs: the entry is a file, and the tree states a directory",
        "the fault",
      );
    });
  });
});
