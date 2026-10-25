// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of how the search of a partition ends, and of the error of a spec that threw. */

import { describe } from "vitest";
import { SpecError } from "../../src/history/ending.js";
import { CallOperation } from "../../src/history/spec.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("ending", () => {
  describe("new SpecError", () => {
    it("returns the error of a function that threw on a stepped call", ({ seat }) => {
      const cause = new Error("boom");
      const err = new SpecError(
        "next",
        { call: 4, operation: new CallOperation("read", [], true, 1) },
        cause,
      );

      check.isEqualTo(
        seat,
        [err.name, err.message, err.fn, err.call, err.operation, err.cause],
        ["SpecError", 'the spec\'s next throws on "read"', "next", 4, "read", cause],
        "the fields",
      );
    });

    it("returns the error of a function that threw before the first step", ({
      seat,
    }) => {
      const err = new SpecError("initial", undefined, "boom");

      check.isEqualTo(
        seat,
        [err.message, err.call, err.operation],
        ["the spec's initial throws", undefined, undefined],
        "no call",
      );
    });
  });
});
