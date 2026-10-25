// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the position of a parse in a pattern. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Cursor, PatternError, SURROGATES } from "../../src/pattern/cursor.js";
import { test as it } from "../../src/vitest.js";

describe("cursor", () => {
  describe("SURROGATES", () => {
    it("states the first and the last surrogate", ({ seat }) => {
      check.isEqualTo(seat, [...SURROGATES], [0xd8_00, 0xdf_ff], "the surrogates");
    });
  });

  describe("new PatternError", () => {
    it("returns an error named PatternError with the message", ({ seat }) => {
      const err = new PatternError('pattern "x" at 0: a reason');

      check.isEqualTo(
        seat,
        [err.name, err.message],
        ["PatternError", 'pattern "x" at 0: a reason'],
        "the error",
      );
    });
  });

  describe("new Cursor", () => {
    it("starts at the first code point of the pattern", ({ seat }) => {
      const cursor = new Cursor("a😀b");

      check.isEqualTo(
        seat,
        [cursor.at, cursor.chars],
        [0, ["a", "😀", "b"]],
        "the start",
      );
    });

    it("refuses a pattern with a lone surrogate at its position", ({ seat }) => {
      const err = check.errorAs(
        seat,
        check.doesThrow(
          seat,
          () => new Cursor(`ab${String.fromCharCode(0xd8_00)}`),
          "the pattern is refused",
        ),
        PatternError,
        "a pattern error",
      );

      check.isEqualTo(
        seat,
        err?.message,
        `pattern ${JSON.stringify(`ab${String.fromCharCode(0xd8_00)}`)} at 2: a lone surrogate is no character`,
        "the position of the surrogate",
      );
    });
  });

  describe("Cursor.peek", () => {
    it("returns the character ahead of the current one, and the empty string past the end", ({
      seat,
    }) => {
      const cursor = new Cursor("ab");

      check.isEqualTo(
        seat,
        [cursor.peek(), cursor.peek(1), cursor.peek(2)],
        ["a", "b", ""],
        "the characters",
      );
    });
  });

  describe("Cursor.next", () => {
    it("returns the current character and moves past it", ({ seat }) => {
      const cursor = new Cursor("ab");

      check.isEqualTo(
        seat,
        [cursor.next("x"), cursor.at],
        ["a", 1],
        "a, then position 1",
      );
    });

    it("refuses the end of the pattern with what is missing", ({ seat }) => {
      const cursor = new Cursor("");

      check.isEqualTo(
        seat,
        check.errorAs(
          seat,
          check.doesThrow(
            seat,
            () => cursor.next("a group is not closed"),
            "the end is refused",
          ),
          PatternError,
          "a pattern error",
        )?.message,
        'pattern "" at 0: a group is not closed',
        "the message",
      );
    });
  });

  describe("Cursor.fail", () => {
    it("returns the error of the pattern at the current position", ({ seat }) => {
      const cursor = new Cursor("abc");
      cursor.at = 2;

      check.isEqualTo(
        seat,
        cursor.fail("a reason").message,
        'pattern "abc" at 2: a reason',
        "the message",
      );
    });
  });
});
