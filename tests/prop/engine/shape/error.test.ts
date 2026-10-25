// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the error of a shape that does not read. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { ShapeError, shown } from "../../../../src/prop/engine/shape/error.js";
import { test as it } from "../../../../src/vitest.js";

describe("error", () => {
  describe("new ShapeError", () => {
    it("returns the error of a shape that does not read", ({ seat }) => {
      const err = new ShapeError("prop: [] is not a shape");

      check.isEqualTo(
        seat,
        [err.name, err.message],
        ["ShapeError", "prop: [] is not a shape"],
        "the name and the message",
      );
    });

    it("keeps the error that made the shape fail as its cause", ({ seat }) => {
      const cause = new RangeError("prop: 1.5 is no integer");

      check.isEqualTo(
        seat,
        new ShapeError("prop: shape.width is 1.5, not an integer", { cause }).cause,
        cause,
        "the cause",
      );
    });
  });

  describe("shown", () => {
    it("returns the JSON text of a value", ({ seat }) => {
      check.isEqualTo(seat, shown([1, "a"]), '[1,"a"]', "the JSON text");
    });

    it("returns the text of a value that has no JSON text", ({ seat }) => {
      check.isEqualTo(seat, shown(undefined), "undefined", "the text");
    });
  });
});
