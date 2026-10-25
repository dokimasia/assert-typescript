// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the generators of collections and text. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { invert } from "../../../src/prop/engine/inverse.js";
import { Pairs } from "../../../src/prop/engine/value.js";
import {
  bytes,
  dict,
  list,
  permutation,
  string,
  stringMatching,
} from "../../../src/prop/generators/collections.js";
import { boolean, integer } from "../../../src/prop/generators.js";
import { test as it } from "../../../src/vitest.js";
import { decoded, int, seq, thrown } from "../../helpers.js";

describe("collections", () => {
  describe("list", () => {
    it("returns the elements of the continue choices", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(list(integer(0, 9)), int(1n), int(4n), int(1n), int(5n), int(0n)),
        [4, 5],
        "two elements",
      );
    });

    it("discards an element equal to an earlier one of a unique list", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(
          list(integer(0, 9), { unique: true }),
          int(1n),
          int(4n),
          int(1n),
          int(4n),
          int(0n),
        ),
        [4],
        "one element",
      );
    });

    {
      const tests = [
        {
          name: "a maximum below the minimum",
          give: { minSize: 2, maxSize: 1 },
          want: "prop: list states the sizes [2, 1], which admit no length",
        },
        {
          name: "a negative minimum",
          give: { minSize: -1 },
          want: "prop: list states the sizes [-1, undefined], which admit no length",
        },
        {
          name: "a maximum that is no whole number",
          give: { maxSize: 1.5 },
          want: "prop: list states the sizes [0, 1.5], which admit no length",
        },
      ];
      for (const tt of tests) {
        it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
          check.isEqualTo(
            seat,
            thrown(() => list(integer(0, 9), tt.give)),
            tt.want,
            "the refusal",
          );
        });
      }
    }
  });

  describe("dict", () => {
    it("returns a Map of the entries", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(dict(integer(0, 9), boolean()), int(1n), int(3n), int(1n), int(0n)),
        new Map([[3, true]]),
        "one entry",
      );
    });

    it("runs a Map or the engine's entries back to choices", ({ seat }) => {
      const generator = dict(integer(0, 9), boolean(), { maxSize: 1 });

      check.isEqualTo(
        seat,
        invert(generator, new Map([[3, true]])),
        invert(generator, new Pairs([[3n, true]])),
        "one choice sequence",
      );
    });

    it("throws a RangeError for sizes that admit no length", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => dict(integer(0, 9), boolean(), { minSize: 3, maxSize: 2 })),
        "prop: dict states the sizes [3, 2], which admit no length",
        "the refusal",
      );
    });
  });

  describe("string", () => {
    it("returns the characters of the default alphabet with the digits first", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        decoded(string(), seq(0, 1, 10)),
        "01a",
        "three characters",
      );
    });

    it("returns the characters of a stated alphabet", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(string({ alphabet: "xy" }), seq(1, 0)),
        "yx",
        "two characters",
      );
    });

    {
      const tests = [
        {
          name: "an empty alphabet",
          give: "",
          want: 'prop: string({ alphabet: "" }) states no character',
        },
        {
          name: "an alphabet that repeats a character",
          give: "aa",
          want: 'prop: string({ alphabet: "aa" }) repeats a character',
        },
        {
          name: "an alphabet with a lone surrogate",
          give: "a\ud800",
          want: 'prop: string({ alphabet: "a\\ud800" }) has a lone surrogate',
        },
      ];
      for (const tt of tests) {
        it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
          check.isEqualTo(
            seat,
            thrown(() => string({ alphabet: tt.give })),
            tt.want,
            "the refusal",
          );
        });
      }
    }

    it("throws a RangeError for sizes that admit no length", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => string({ maxSize: -1 })),
        "prop: string states the sizes [0, -1], which admit no length",
        "the refusal",
      );
    });
  });

  describe("bytes", () => {
    it("returns the bytes of a sequence", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(bytes(), seq(1, 255)),
        Uint8Array.of(1, 255),
        "two bytes",
      );
    });

    it("throws a RangeError for sizes that admit no length", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => bytes({ minSize: 0.5 })),
        "prop: bytes states the sizes [0.5, undefined], which admit no length",
        "the refusal",
      );
    });
  });

  describe("permutation", () => {
    it("returns the values in their order for the target swaps", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(permutation("a", "b", "c"), int(0n), int(1n)),
        ["a", "b", "c"],
        "the stated order",
      );
    });
  });

  describe("stringMatching", () => {
    it("returns a string that the pattern matches", ({ seat }) => {
      check.isEqualTo(seat, decoded(stringMatching("ab")), "ab", "the literal pattern");
    });

    it("throws a RangeError for a pattern outside the portable subset", ({ seat }) => {
      check.hasPrefix(
        seat,
        thrown(() => stringMatching("(")),
        'prop: stringMatching("(") states no pattern of the portable subset: pattern "(" at ',
        "the refusal",
      );
    });
  });
});
