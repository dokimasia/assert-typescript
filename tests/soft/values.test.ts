// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions of `soft` about one value. It uses vitest's
 * `expect` alone, because the other specs assert with the library's
 * surfaces.
 */

import { describe } from "vitest";
import * as aborting from "../../src/check/values.js";
import * as values from "../../src/soft/values.js";
import { recordingCases } from "../helpers.js";

describe("values", () => {
  recordingCases(values, aborting);
});
