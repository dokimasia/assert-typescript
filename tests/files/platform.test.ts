/** The spec of what the file systems of the platform record. */

import { describe } from "vitest";
import { HOST, targetOf } from "../../src/files/platform.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { WINDOWS } from "../helpers.js";

describe("platform", () => {
  describe("HOST", () => {
    it.skipIf(WINDOWS)("records the nine permission bits off Windows", ({ seat }) => {
      check.equal(
        seat,
        [HOST.recordedBits, HOST.modeFault],
        [0o777, undefined],
        "a tree reads every bit, and a mode can be read",
      );
    });

    it.runIf(WINDOWS)("records no permission bit on Windows", ({ seat }) => {
      check.equal(
        seat,
        [HOST.recordedBits, HOST.modeFault],
        [0, "the file system records no permission bits"],
        "a tree reads no bit, and a mode cannot be read",
      );
    });
  });

  describe("targetOf", () => {
    it("returns a relative target with slashes as it is", ({ seat }) => {
      check.equal(seat, targetOf("../shared/a.txt"), "../shared/a.txt", "the target");
    });

    it.skipIf(WINDOWS)(
      "keeps a backslash, which is part of a name off Windows",
      ({ seat }) => {
        check.equal(seat, targetOf("a\\b"), "a\\b", "the backslash is kept");
      },
    );

    it.runIf(WINDOWS)(
      "returns the names of a target with slashes on Windows",
      ({ seat }) => {
        check.equal(seat, targetOf("a\\b"), "a/b", "the backslash separates names");
      },
    );

    it.runIf(WINDOWS)(
      "drops the prefix of an absolute target on Windows",
      ({ seat }) => {
        check.equal(seat, targetOf("\\\\?\\C:\\a"), "C:/a", "the prefix is dropped");
      },
    );
  });
});
