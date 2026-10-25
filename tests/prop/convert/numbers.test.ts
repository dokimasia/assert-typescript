// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the converters of the shapes whose TypeScript value is a number. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  OFFSET,
  SMALL_INT,
  SMALL_INT_WIDTH,
} from "../../../src/prop/convert/numbers.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

describe("numbers", () => {
  describe("SMALL_INT_WIDTH", () => {
    it("is 32 bits", ({ seat }) => {
      check.isEqualTo(seat, SMALL_INT_WIDTH, 32, "the widest int of a number");
    });
  });

  describe("SMALL_INT", () => {
    it("converts an int to a number and back", ({ seat }) => {
      check.isEqualTo(
        seat,
        [SMALL_INT.to(-5n), SMALL_INT.back(-5), SMALL_INT.back(-5n)],
        [-5, -5n, -5n],
        "the number, and the bigint of either form",
      );
    });

    it("refuses a number that is no safe integer", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => SMALL_INT.back(1.5)),
        "prop: 1.5 is no value of the int shape",
        "the refusal",
      );
    });
  });

  describe("OFFSET", () => {
    it("converts an offset to the seconds east of UTC and back", ({ seat }) => {
      check.isEqualTo(
        seat,
        [OFFSET.to(3600n), OFFSET.back(3600), OFFSET.back(3600n)],
        [3600, 3600n, 3600n],
        "the seconds, and the bigint of either form",
      );
    });

    it("refuses a value that is no safe integer", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => OFFSET.back("+01:00")),
        'prop: "+01:00" is no value of the offset shape',
        "the refusal",
      );
    });
  });
});
