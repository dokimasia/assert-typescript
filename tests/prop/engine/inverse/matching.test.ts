// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the steps that a pattern takes to match a string.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import type { IntegerBounds } from "../../../../src/prop/engine/choice.js";
import { matches } from "../../../../src/prop/engine/inverse/matching.js";
import { piece } from "../../../../src/prop/engine/pattern.js";
import { test as it } from "../../../../src/vitest.js";

/** Returns where each way that the pattern text matches the string ends. */
function ends(text: string, string: string): number[] {
  return [...matches(piece(text), [...string], 0)].map(([end]) => end);
}

describe("matching", () => {
  describe("matches", () => {
    it("matches a literal without a step", ({ seat }) => {
      check.isEqualTo(seat, [...matches(piece("a"), ["a"], 0)], [[1, []]], "one way");
    });

    it("matches a class with the offset of the character", ({ seat }) => {
      const ways = [...matches(piece("[0-9]"), ["7"], 0)].map(([end, steps]) => [
        end,
        steps.map((s) => [(s.bounds as IntegerBounds).hi, s.value]),
      ]);

      check.isEqualTo(
        seat,
        ways,
        [[1, [[9n, 7n]]]],
        "one way with the offset 7 of 0 to 9",
      );
    });

    it("tries the alternatives in order", ({ seat }) => {
      check.isEqualTo(seat, ends("a|ab", "ab"), [1, 2], "the first alternative first");
    });

    it("repeats a quantifier as often as it can first", ({ seat }) => {
      check.isEqualTo(seat, ends("a*", "aa"), [2, 1, 0], "the most repetitions first");
    });

    it("matches the items of a sequence one after another", ({ seat }) => {
      check.isEqualTo(seat, ends("ab", "ab"), [2], "one way to the end");
    });

    it("yields no way for a character that the pattern does not match", ({ seat }) => {
      check.isEmpty(seat, ends("b", "a"), "no way");
    });

    it("yields no way past the end of the string", ({ seat }) => {
      check.isEmpty(seat, ends("[a-z]", ""), "no way");
    });
  });
});
