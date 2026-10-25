// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the public module `files`. */

import { describe } from "vitest";
import * as files from "../../src/files/index.js";
import { check } from "../../src/index.js";
import { compareText } from "../../src/order.js";
import { test as it } from "../../src/vitest.js";

describe("index", () => {
  it("exports the names of the module files", ({ seat }) => {
    check.isEqualTo(
      seat,
      Object.keys(files).sort(compareText),
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
