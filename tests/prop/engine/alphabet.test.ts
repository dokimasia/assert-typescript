/** The spec of the default alphabet of the string generator. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  character,
  indexOf,
  indices,
  merge,
  SIZE,
} from "../../../src/prop/engine/alphabet.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** The index of DEL, the first code point after the printable characters and the controls below space. */
const DEL = 95 + 32;

/** The index of U+E000, the first code point after the surrogates. */
const AFTER_SURROGATES = DEL + (0xd7ff - 0x7f + 1);

describe("alphabet", () => {
  describe("SIZE", () => {
    it("counts every Unicode scalar value", ({ seat }) => {
      check.equal(
        seat,
        SIZE,
        0x110000 - 0x800,
        "the code points without the surrogates",
      );
    });
  });

  describe("character", () => {
    const tests = [
      { name: "the digit 0 at index 0", give: 0, want: "0" },
      { name: "the first lowercase letter after the digits", give: 10, want: "a" },
      { name: "space after the letters", give: 62, want: " " },
      {
        name: "the first control after the printable characters",
        give: 95,
        want: "\u0000",
      },
      { name: "DEL after the controls", give: DEL, want: "\u007f" },
      {
        name: "the code point after the surrogates",
        give: AFTER_SURROGATES,
        want: "",
      },
      {
        name: "the last scalar value at the last index",
        give: SIZE - 1,
        want: "\u{10ffff}",
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, character(tt.give), tt.want, "the character");
      });
    }

    it("throws a RangeError for an index below 0", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => character(-1)),
        "prop: index -1 is outside the default alphabet",
        "the refusal",
      );
    });

    it("throws a RangeError for an index of SIZE", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => character(SIZE)),
        `prop: index ${SIZE} is outside the default alphabet`,
        "the refusal",
      );
    });
  });

  describe("indexOf", () => {
    it("returns the index of every character that character returns", ({ seat }) => {
      const sample = [0, 9, 61, 94, 95, 126, DEL, 55_000, AFTER_SURROGATES, SIZE - 1];

      check.equal(
        seat,
        sample.map((index) => indexOf(character(index))),
        sample,
        "the indices come back",
      );
    });

    it("returns undefined for a lone surrogate", ({ seat }) => {
      check.isNil(seat, indexOf("\ud800"), "a surrogate has no index");
    });
  });

  describe("indices", () => {
    it("returns one interval for the digits", ({ seat }) => {
      check.equal(seat, indices(0x30, 0x39), [[0, 9]], "the digits");
    });

    it("returns the indices of a range across the printable characters and the controls", ({
      seat,
    }) => {
      check.equal(
        seat,
        indices(0x1e, 0x21),
        [
          [62, 63],
          [95 + 30, 95 + 31],
        ],
        "two controls, space and !",
      );
    });

    it("leaves the surrogates out", ({ seat }) => {
      check.equal(
        seat,
        indices(0xd7ff, 0xe000),
        [[AFTER_SURROGATES - 1, AFTER_SURROGATES]],
        "the code points around the surrogates are neighbours in the alphabet",
      );
    });

    it("returns no interval for a range of surrogates alone", ({ seat }) => {
      check.isEmpty(seat, indices(0xd800, 0xdfff), "no index");
    });
  });

  describe("merge", () => {
    it("returns the sorted union of overlapping and touching intervals", ({ seat }) => {
      check.equal(
        seat,
        merge([
          [10, 12],
          [1, 3],
          [1, 2],
          [4, 5],
          [11, 20],
        ]),
        [
          [1, 5],
          [10, 20],
        ],
        "two intervals",
      );
    });

    it("keeps intervals apart that neither overlap nor touch", ({ seat }) => {
      check.equal(
        seat,
        merge([
          [5, 6],
          [1, 3],
        ]),
        [
          [1, 3],
          [5, 6],
        ],
        "two intervals",
      );
    });
  });
});
