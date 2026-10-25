// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions of `soft` about errors and about what code
 * does when it runs. It uses vitest's `expect` alone, because the other
 * specs assert with the library's surfaces.
 */

import { describe } from "vitest";
import * as aborting from "../../src/check/behaviour.js";
import * as behaviour from "../../src/soft/behaviour.js";
import { recordingCases } from "../helpers.js";

describe("behaviour", () => {
  recordingCases(behaviour, aborting);
});
