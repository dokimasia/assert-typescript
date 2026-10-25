// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the surface that records a failure and lets the test
 * continue. It uses vitest's `expect` alone, because the other specs assert
 * with the library's surfaces.
 */

import { describe, expect, it } from "vitest";
import { compareText } from "../src/order.js";
import * as behaviour from "../src/soft/behaviour.js";
import * as relations from "../src/soft/relations.js";
import * as values from "../src/soft/values.js";
import * as soft from "../src/soft.js";
import { FAILING } from "./helpers.js";

describe("soft", () => {
  it("exports an assertion for each failing call of the shared table", () => {
    expect(Object.keys(soft).sort(compareText)).toEqual(
      Object.keys(FAILING).sort(compareText),
    );
  });

  it("exports the assertions of the modules behaviour, relations and values", () => {
    expect({ ...soft }).toEqual({ ...behaviour, ...relations, ...values });
  });
});
