// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of how the values of one shape convert, and of the refusal of a value. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { IDENTITY, refuse } from "../../../src/prop/convert/converter.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

describe("converter", () => {
  describe("IDENTITY", () => {
    it("returns a value in both directions", ({ seat }) => {
      check.isEqualTo(
        seat,
        [IDENTITY.to(1n), IDENTITY.back(1n)],
        [1n, 1n],
        "the same value",
      );
    });
  });

  describe("refuse", () => {
    it("throws a TypeError that names the shape", ({ seat }) => {
      check.errorAs(
        seat,
        check.doesThrow(seat, () => refuse("x", "int"), "the value is refused"),
        TypeError,
        "a TypeError",
      );
    });

    it("states a value as its JSON text", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => refuse({ a: 1 }, "record")),
        'prop: {"a":1} is no value of the record shape',
        "the JSON text of the object",
      );
    });

    it("states a bigint with the suffix n", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => refuse(5n, "uuid")),
        "prop: 5n is no value of the uuid shape",
        "5n",
      );
    });

    it("states a value that has no JSON text as its string", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => refuse(undefined, "date")),
        "prop: undefined is no value of the date shape",
        "undefined",
      );
    });
  });
});
