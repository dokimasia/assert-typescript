// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the steps that a generator emits when it runs backwards.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { IntegerBounds } from "../../../../src/prop/engine/choice.js";
import {
  CannotInvert,
  NoInverse,
} from "../../../../src/prop/engine/inverse/refusal.js";
import {
  BIT,
  chosen,
  hasPlaceholder,
  indexOf,
  madeChoices,
  PLACEHOLDER,
  step,
} from "../../../../src/prop/engine/inverse/steps.js";
import { test as it } from "../../../../src/vitest.js";

/** The bounds of a digit. */
const DIGIT = new IntegerBounds(0n, 9n);

/** A step of the digit 4. */
const FOUR = { bounds: DIGIT, value: 4n };

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

  describe("hasPlaceholder", () => {
    it("reports the placeholder of a composite among the steps", ({ seat }) => {
      check.isEqualTo(
        seat,
        [hasPlaceholder([FOUR, PLACEHOLDER]), hasPlaceholder([FOUR])],
        [true, false],
        "the steps with a placeholder",
      );
    });
  });

  describe("madeChoices", () => {
    it("returns the steps without the placeholders", ({ seat }) => {
      check.isEqualTo(
        seat,
        madeChoices([PLACEHOLDER, FOUR, PLACEHOLDER]),
        [FOUR],
        "the step of the digit",
      );
    });
  });

  describe("chosen", () => {
    it("returns steps that make a choice each", ({ seat }) => {
      check.isEqualTo(seat, chosen([FOUR]), [FOUR], "the step of the digit");
    });

    it("refuses with a NoInverse the placeholder of a composite", ({ seat }) => {
      const err = check.errorAs(
        seat,
        check.doesThrow(
          seat,
          () => chosen([FOUR, PLACEHOLDER]),
          "the steps are refused",
        ),
        NoInverse,
        "a NoInverse",
      );

      check.isEqualTo(
        seat,
        err?.message,
        "prop: a Composite does not run backwards",
        "the refusal names the composite",
      );
    });
  });
});
