// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions of `check` about one value. It uses vitest's
 * `expect` alone, because the other specs assert with this surface.
 */

import { describe } from "vitest";
import * as values from "../../src/check/values.js";
import { abortingCases } from "../helpers.js";

describe("values", () => {
  abortingCases(values);
});
