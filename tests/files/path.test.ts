/** The spec of the assertions about the entry at one path. */

import { join } from "node:path";
import { describe } from "vitest";
import { bytes, directory, link, text } from "../../src/files/entry.js";
import {
  absent,
  hasContent,
  hasMode,
  isDir,
  isFile,
  linksTo,
} from "../../src/files/path.js";
import { workspace } from "../../src/files/workspace.js";
import { check } from "../../src/index.js";
import { type Collector, Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { records, WINDOWS } from "../helpers.js";

/** The bytes of a PNG file's signature, which are no UTF-8 text. */
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);

/** A name longer than a file system takes, which a read refuses. */
const TOO_LONG = "n".repeat(300);

/** Returns a workspace of a file of text, a file of bytes, a directory with a mode, and a link. */
function fixture(seat: Collector): string {
  return workspace(seat, {
    "a.txt": text("a\n"),
    "logo.png": bytes(PNG),
    keys: directory().withMode(0o700),
    "keys/id": text("secret\n").withMode(0o600),
    current: link("a.txt"),
    dangling: link("missing.txt"),
  });
}

/**
 * Returns the outcome of the call that call makes on a new recorder: the
 * verdict, with the detail of a failure or the text of a fault.
 */
function outcome(call: (recorder: Recorder) => void): unknown[] {
  const recorder = new Recorder();
  call(recorder);
  const verdict = records(recorder)[0]?.["verdict"];
  if (verdict === "fail") return [verdict, recorder.failures[0]?.detail];
  if (verdict === "error") return [verdict, recorder.message];
  return [verdict];
}

describe("path", () => {
  describe("absent", () => {
    it("passes a path where nothing is", ({ seat }) => {
      const dir = fixture(seat);

      check.equal(
        seat,
        outcome((r) => absent(r, join(dir, "b.txt"), "m")),
        ["pass"],
        "nothing is there",
      );
    });

    it("passes a path below a file", ({ seat }) => {
      const dir = fixture(seat);

      check.equal(
        seat,
        outcome((r) => absent(r, join(dir, "a.txt", "b"), "m")),
        ["pass"],
        "nothing is below a file",
      );
    });

    it("reports the kind of the entry at the path", ({ seat }) => {
      const dir = fixture(seat);

      check.equal(
        seat,
        outcome((r) => absent(r, join(dir, "a.txt"), "m")),
        ["fail", { got: "file" }],
        "a file is there",
      );
    });

    it("reports a link whose target is missing", ({ seat }) => {
      const dir = fixture(seat);

      check.equal(
        seat,
        outcome((r) => absent(r, join(dir, "dangling"), "m")),
        ["fail", { got: "link" }],
        "the link is there",
      );
    });

    it("ends the call with a fault for a path that the file system refuses", ({
      seat,
    }) => {
      const dir = fixture(seat);
      const [verdict, fault] = outcome((r) => absent(r, join(dir, TOO_LONG), "m"));

      check.equal(seat, verdict, "error", "the verdict");
      check.hasPrefix(
        seat,
        fault as string,
        "files.absent: the entry cannot be read: ENAMETOOLONG",
        "the fault",
      );
    });
  });

  describe("isFile", () => {
    const tests = [
      { name: "passes a file", give: "a.txt", want: ["pass"] },
      {
        name: "reports a directory",
        give: "keys",
        want: ["fail", { got: "directory" }],
      },
      {
        name: "reports a link to a file",
        give: "current",
        want: ["fail", { got: "link" }],
      },
      {
        name: "reports null where nothing is",
        give: "b.txt",
        want: ["fail", { got: null }],
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        const dir = fixture(seat);

        check.equal(
          seat,
          outcome((r) => isFile(r, join(dir, tt.give), "m")),
          tt.want,
          "the outcome",
        );
      });
    }

    it.skipIf(WINDOWS)(
      "ends the call with a fault for an entry that is no file, directory or link",
      ({ seat }) => {
        check.equal(
          seat,
          outcome((r) => isFile(r, "/dev/null", "m")),
          ["error", "files.isFile: the entry is no file, directory or link"],
          "the fault",
        );
      },
    );
  });

  describe("isDir", () => {
    const tests = [
      { name: "passes a directory", give: "keys", want: ["pass"] },
      { name: "reports a file", give: "a.txt", want: ["fail", { got: "file" }] },
      {
        name: "reports null where nothing is",
        give: "build",
        want: ["fail", { got: null }],
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        const dir = fixture(seat);

        check.equal(
          seat,
          outcome((r) => isDir(r, join(dir, tt.give), "m")),
          tt.want,
          "the outcome",
        );
      });
    }

    it("ends the call with a fault that names isDir", ({ seat }) => {
      const [, fault] = outcome((r) => isDir(r, join(fixture(seat), TOO_LONG), "m"));

      check.hasPrefix(seat, fault as string, "files.isDir: ", "the fault");
    });
  });

  describe("linksTo", () => {
    const tests = [
      {
        name: "passes a link to the target",
        give: "current",
        giveTarget: "a.txt",
        want: ["pass"],
      },
      {
        name: "reports another target",
        give: "current",
        giveTarget: "b.txt",
        want: ["fail", { want: "b.txt", got: "a.txt", kind: "link" }],
      },
      {
        name: "reports a file",
        give: "a.txt",
        giveTarget: "b.txt",
        want: ["fail", { want: "b.txt", got: null, kind: "file" }],
      },
      {
        name: "reports null where nothing is",
        give: "missing",
        giveTarget: "b.txt",
        want: ["fail", { want: "b.txt", got: null, kind: null }],
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        const dir = fixture(seat);

        check.equal(
          seat,
          outcome((r) => linksTo(r, join(dir, tt.give), tt.giveTarget, "m")),
          tt.want,
          "the outcome",
        );
      });
    }

    it("ends the call with a fault that names linksTo", ({ seat }) => {
      const [, fault] = outcome((r) =>
        linksTo(r, join(fixture(seat), TOO_LONG), "a", "m"),
      );

      check.hasPrefix(seat, fault as string, "files.linksTo: ", "the fault");
    });
  });

  describe("hasContent", () => {
    const tests = [
      {
        name: "passes a file of the text",
        give: "a.txt",
        giveContent: "a\n" as string | Uint8Array,
        want: ["pass"],
      },
      {
        name: "passes a file of the bytes",
        give: "logo.png",
        giveContent: PNG,
        want: ["pass"],
      },
      {
        name: "compares bytes with a file of text",
        give: "a.txt",
        giveContent: Uint8Array.of(0x61, 0x0a),
        want: ["pass"],
      },
      {
        name: "reports another text",
        give: "a.txt",
        giveContent: "a\r\n",
        want: ["fail", { want: "a\r\n", got: "a\n", kind: "file" }],
      },
      {
        name: "reports other bytes as bytes",
        give: "logo.png",
        giveContent: Uint8Array.of(0x89),
        want: ["fail", { want: Uint8Array.of(0x89), got: PNG, kind: "file" }],
      },
      {
        name: "reports a directory",
        give: "keys",
        giveContent: "",
        want: ["fail", { want: "", got: null, kind: "directory" }],
      },
      {
        name: "reports null where nothing is",
        give: "b.txt",
        giveContent: "b",
        want: ["fail", { want: "b", got: null, kind: null }],
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        const dir = fixture(seat);

        check.equal(
          seat,
          outcome((r) => hasContent(r, join(dir, tt.give), tt.giveContent, "m")),
          tt.want,
          "the outcome",
        );
      });
    }

    it("ends the call with a fault for text with a lone surrogate", ({ seat }) => {
      const dir = fixture(seat);

      check.equal(
        seat,
        outcome((r) => hasContent(r, join(dir, "a.txt"), "\ud800", "m")),
        [
          "error",
          "files.hasContent: the wanted text has a lone surrogate, which UTF-8 cannot encode",
        ],
        "the fault",
      );
    });
  });

  describe("hasMode", () => {
    const tests = [
      {
        name: "passes a file of the mode",
        give: "keys/id",
        giveMode: 0o600,
        want: ["pass"],
      },
      {
        name: "passes a directory of the mode",
        give: "keys",
        giveMode: 0o700,
        want: ["pass"],
      },
      {
        name: "reports another mode",
        give: "keys/id",
        giveMode: 0o644,
        want: ["fail", { want: 0o644, got: 0o600, kind: "file" }],
      },
      {
        name: "reports a link, which has no mode",
        give: "current",
        giveMode: 0o644,
        want: ["fail", { want: 0o644, got: null, kind: "link" }],
      },
      {
        name: "reports null where nothing is",
        give: "b.txt",
        giveMode: 0o644,
        want: ["fail", { want: 0o644, got: null, kind: null }],
      },
    ];

    for (const tt of tests) {
      it.skipIf(WINDOWS)(tt.name, ({ seat }) => {
        const dir = fixture(seat);

        check.equal(
          seat,
          outcome((r) => hasMode(r, join(dir, tt.give), tt.giveMode, "m")),
          tt.want,
          "the outcome",
        );
      });
    }

    it("ends the call with a fault for a mode beyond the nine permission bits", ({
      seat,
    }) => {
      const dir = fixture(seat);

      check.equal(
        seat,
        outcome((r) => hasMode(r, join(dir, "a.txt"), 0o1000, "m")),
        ["error", "files.hasMode: the mode 0o1000 is no integer from 0 to 0o777"],
        "the fault",
      );
    });

    it.runIf(WINDOWS)(
      "ends the call with a fault on a file system that records no permission bits",
      ({ seat }) => {
        const dir = fixture(seat);

        check.equal(
          seat,
          outcome((r) => hasMode(r, join(dir, "a.txt"), 0o644, "m")),
          ["error", "files.hasMode: the file system records no permission bits"],
          "the fault",
        );
      },
    );
  });
});
