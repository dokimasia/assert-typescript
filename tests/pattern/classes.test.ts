// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the classes of the portable pattern subset. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import {
  classAt,
  classOf,
  DOT,
  METACHARACTERS,
  members,
  SHORTHANDS,
} from "../../src/pattern/classes.js";
import { Cursor, PatternError } from "../../src/pattern/cursor.js";
import { test as it } from "../../src/vitest.js";

/** Returns the class that the cursor after the `[` of text parses. */
function parsed(text: string): unknown {
  const cursor = new Cursor(text);
  cursor.at = 1;
  return classAt(cursor);
}

describe("classes", () => {
  describe("METACHARACTERS", () => {
    it("lists the fourteen characters that are literal only after a backslash", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        [...METACHARACTERS].join(""),
        "\\.^$|?*+()[]{}",
        "the metacharacters",
      );
    });
  });

  describe("SHORTHANDS", () => {
    it("states the members of the three escapes", ({ seat }) => {
      check.isEqualTo(
        seat,
        Object.keys(SHORTHANDS),
        ["d", "w", "s"],
        "the escapes \\d, \\w and \\s",
      );
    });
  });

  describe("members", () => {
    it("returns a range of one code point for each character", ({ seat }) => {
      check.isEqualTo(
        seat,
        members("a😀"),
        [
          [0x61, 0x61],
          [0x1_f6_00, 0x1_f6_00],
        ],
        "two ranges",
      );
    });
  });

  describe("classOf", () => {
    it("sorts the ranges and joins adjacent ones", ({ seat }) => {
      check.isEqualTo(
        seat,
        classOf([
          [5, 6],
          [1, 2],
          [3, 4],
        ]),
        { kind: "class", ranges: [[1, 6]] },
        "one range",
      );
    });
  });

  describe("DOT", () => {
    it("leaves out the line terminators and the surrogates", ({ seat }) => {
      check.isEqualTo(
        seat,
        DOT,
        {
          kind: "class",
          ranges: [
            [0x0, 0x9],
            [0xb, 0xc],
            [0xe, 0x84],
            [0x86, 0x20_27],
            [0x20_2a, 0xd7_ff],
            [0xe0_00, 0x10_ff_ff],
          ],
        },
        "the class of .",
      );
    });
  });

  describe("classAt", () => {
    it("parses the characters, the ranges and the escapes of a class", ({ seat }) => {
      check.isEqualTo(
        seat,
        parsed("[a-c\\d]"),
        {
          kind: "class",
          ranges: [
            [0x30, 0x39],
            [0x61, 0x63],
          ],
        },
        "a to c and the digits",
      );
    });

    it("complements a class that starts with ^", ({ seat }) => {
      check.isEqualTo(
        seat,
        parsed("[^a]"),
        {
          kind: "class",
          ranges: [
            [0x0, 0x60],
            [0x62, 0xd7_ff],
            [0xe0_00, 0x10_ff_ff],
          ],
        },
        "every scalar value but a",
      );
    });

    it("refuses an empty class", ({ seat }) => {
      check.errorAs(
        seat,
        check.doesThrow(seat, () => parsed("[]"), "the class is refused"),
        PatternError,
        "a pattern error",
      );
    });

    it("refuses a range that runs backwards", ({ seat }) => {
      const err = check.errorAs(
        seat,
        check.doesThrow(seat, () => parsed("[c-a]"), "the class is refused"),
        PatternError,
        "a pattern error",
      );

      check.isEqualTo(
        seat,
        err?.message,
        'pattern "[c-a]" at 4: the range c-a runs backwards',
        "the position after the range",
      );
    });
  });
});
