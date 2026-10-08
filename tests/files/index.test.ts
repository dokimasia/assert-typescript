/** The spec of the public module `files`. */

import { describe } from "vitest";
import * as files from "../../src/files/index.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("index", () => {
  it("exports the names of the module files", ({ seat }) => {
    check.equal(
      seat,
      Object.keys(files).sort(),
      [
        "Entry",
        "absent",
        "bytes",
        "contains",
        "directory",
        "equal",
        "executable",
        "hasContent",
        "hasMode",
        "isDir",
        "isFile",
        "link",
        "linksTo",
        "read",
        "text",
        "unchanged",
        "workspace",
        "write",
      ],
      "the module exports these names",
    );
  });
});
