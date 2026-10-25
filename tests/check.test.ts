// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the surface that stops the test at the first failure. It
 * uses vitest's `expect` alone, because the other specs assert with this
 * surface.
 */

import { describe, expect, it } from "vitest";
import * as behaviour from "../src/check/behaviour.js";
import * as relations from "../src/check/relations.js";
import * as values from "../src/check/values.js";
import * as check from "../src/check.js";
import { compareText } from "../src/order.js";
import { doesReject } from "../src/rejects.js";
import { FAILING } from "./helpers.js";

describe("check", () => {
  it("exports an assertion for each failing call of the shared table besides doesReject", () => {
    expect(
      Object.keys(check)
        .filter((name) => name !== "doesReject")
        .sort(compareText),
    ).toEqual(Object.keys(FAILING).sort(compareText));
  });

  it("exports the doesReject of the module rejects", () => {
    expect(check.doesReject).toBe(doesReject);
  });

  it("exports the assertions of the modules behaviour, relations and values", () => {
    expect({ ...check }).toEqual({ ...behaviour, ...relations, ...values, doesReject });
  });
});
