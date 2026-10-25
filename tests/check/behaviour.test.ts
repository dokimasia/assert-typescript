// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions of `check` about errors and about what code
 * does when it runs. It uses vitest's `expect` alone, because the other
 * specs assert with this surface.
 */

import { describe } from "vitest";
import * as behaviour from "../../src/check/behaviour.js";
import { abortingCases } from "../helpers.js";

describe("behaviour", () => {
  abortingCases(behaviour);
});
