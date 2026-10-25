// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the steps that a generator emits when it runs backwards.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { IntegerBounds } from "../../../../src/prop/engine/choice.js";
import { CannotInvert } from "../../../../src/prop/engine/inverse/refusal.js";
import { BIT, indexOf, step } from "../../../../src/prop/engine/inverse/steps.js";
import { test as it } from "../../../../src/vitest.js";

/** The bounds of a digit. */
const DIGIT = new IntegerBounds(0n, 9n);

describe("steps", () => {
  describe("BIT", () => {
    it("admits 0 and 1 alone", ({ seat }) => {
      check.isEqualTo(
        seat,
        [BIT.admits(0n), BIT.admits(1n), BIT.admits(2n)],
        [true, true, false],
        "the choices that a bit admits",
      );
    });
  });

  describe("step", () => {
    it("returns a step of a value that its bounds admit", ({ seat }) => {
      check.isEqualTo(seat, step(DIGIT, 4n), { bounds: DIGIT, value: 4n }, "the step");
    });

    it("refuses a value outside its bounds", ({ seat }) => {
      const err = check.errorAs(
        seat,
        check.doesThrow(seat, () => step(DIGIT, 10n), "the value is refused"),
        CannotInvert,
        "a refusal",
      );

      check.isEqualTo(
        seat,
        err?.message,
        "prop: int:10 is outside integer 0 9",
        "the refusal names the bounds",
      );
    });
  });

  describe("indexOf", () => {
    it("returns the first index of an equal value", ({ seat }) => {
      check.isEqualTo(seat, indexOf(["a", "b", "a"], "a"), 0, "the first index");
    });

    it("compares the values by their canonical text", ({ seat }) => {
      check.isEqualTo(
        seat,
        indexOf([[1n], [2n]], [2n]),
        1,
        "the index of an equal list",
      );
    });

    it("refuses a value that equals none of the values", ({ seat }) => {
      check.errorAs(
        seat,
        check.doesThrow(seat, () => indexOf(["a"], "b"), "the value is refused"),
        CannotInvert,
        "a refusal",
      );
    });
  });
});
