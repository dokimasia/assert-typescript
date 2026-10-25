// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions of `soft` about the relation between the
 * results of several calls. It uses vitest's `expect` alone, because the
 * other specs assert with the library's surfaces.
 */

import { describe } from "vitest";
import * as aborting from "../../src/check/relations.js";
import * as relations from "../../src/soft/relations.js";
import { recordingCases } from "../helpers.js";

describe("relations", () => {
  recordingCases(relations, aborting);
});
