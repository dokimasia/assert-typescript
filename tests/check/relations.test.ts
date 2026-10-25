// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions of `check` about the relation between the
 * results of several calls. It uses vitest's `expect` alone, because the
 * other specs assert with this surface.
 */

import { describe } from "vitest";
import * as relations from "../../src/check/relations.js";
import { abortingCases } from "../helpers.js";

describe("relations", () => {
  abortingCases(relations);
});
