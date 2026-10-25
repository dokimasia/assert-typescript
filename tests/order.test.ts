// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the order of text. */

import { describe } from "vitest";
import { check } from "../src/index.js";
import { compareText } from "../src/order.js";
import { test as it } from "../src/vitest.js";

describe("order", () => {
  describe("compareText", () => {
    it("returns a negative number for a string that sorts first", ({ seat }) => {
      check.isTrue(seat, compareText("a", "b") < 0, "a sorts before b");
    });

    it("returns a positive number for a string that sorts last", ({ seat }) => {
      check.isTrue(seat, compareText("b", "a") > 0, "b sorts after a");
    });

    it("returns 0 for equal strings", ({ seat }) => {
      check.isEqualTo(seat, compareText("a", "a"), 0, "a string sorts with itself");
    });

    it("sorts as Array.prototype.sort sorts without a comparator", ({ seat }) => {
      const names = ["b", "B", "a", "é", "A", "e", "10", "9"];

      check.isEqualTo(
        seat,
        [...names].sort(compareText),
        ["10", "9", "A", "B", "a", "b", "e", "é"],
        "the order of UTF-16 code units",
      );
    });
  });
});
