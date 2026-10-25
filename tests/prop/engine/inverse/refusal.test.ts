// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the refusals of a value that a generator cannot produce.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  CannotInvert,
  NoInverse,
  shown,
} from "../../../../src/prop/engine/inverse/refusal.js";
import { test as it } from "../../../../src/vitest.js";

describe("refusal", () => {
  describe("new CannotInvert", () => {
    it("returns the refusal of a value", ({ seat }) => {
      const err = new CannotInvert("prop: int:10 is outside integer 0 9");

      check.isEqualTo(
        seat,
        [err.name, err.message],
        ["CannotInvert", "prop: int:10 is outside integer 0 9"],
        "the name and the message",
      );
    });

    it("keeps the error that caused the refusal", ({ seat }) => {
      const cause = new RangeError("out of range");

      check.isEqualTo(
        seat,
        new CannotInvert("prop: no value", { cause }).cause,
        cause,
        "the cause",
      );
    });
  });

  describe("new NoInverse", () => {
    it("returns a refusal of a value", ({ seat }) => {
      check.errorIs(
        seat,
        new NoInverse("prop: a map does not run backwards"),
        CannotInvert,
        "a NoInverse is a CannotInvert",
      );
    });
  });

  describe("shown", () => {
    it("returns the canonical text of a value", ({ seat }) => {
      check.isEqualTo(
        seat,
        shown([1n, "a"]),
        'list:[int:1,string:"a"]',
        "the text of a list",
      );
    });
  });
});
