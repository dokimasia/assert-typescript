/** The spec of the shortlex order of choice sequences. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../../src/prop/engine/choice.js";
import { choiceKey, compareSequences } from "../../../src/prop/engine/order.js";
import { test as it } from "../../../src/vitest.js";

describe("order", () => {
  describe("choiceKey", () => {
    it("returns the rank of integers before the key of an integer", ({ seat }) => {
      check.equal(
        seat,
        choiceKey(new IntegerBounds(-5n, 5n), -2n),
        [0n, 2n, 1n],
        "the distance 2 below the target",
      );
    });

    it("returns the rank of floats before the key of a float", ({ seat }) => {
      check.equal(
        seat,
        choiceKey(new FloatBounds(0, 1), 0.5),
        [1n, 1n, 1n, 1n, 0n],
        "one fractional bit and the numerator 1",
      );
    });

    it("returns the key of a sequence with the rank of sequences first", ({ seat }) => {
      check.equal(
        seat,
        choiceKey(new SequenceBounds(4), [3, 1]),
        [2n, 2, 3, 1],
        "two elements",
      );
    });
  });

  describe("compareSequences", () => {
    const tests = [
      {
        name: "a negative number for a shorter sequence",
        give: [[[0n]], [[0n], [0n]]],
        want: -1,
      },
      {
        name: "a positive number for a longer sequence",
        give: [[[0n], [0n]], [[5n]]],
        want: 1,
      },
      {
        name: "a negative number for a smaller first difference",
        give: [
          [
            [0n, 1n],
            [0n, 9n],
          ],
          [
            [0n, 2n],
            [0n, 0n],
          ],
        ],
        want: -1,
      },
      {
        name: "a positive number for a larger first difference",
        give: [
          [
            [0n, 1n],
            [0n, 9n],
          ],
          [
            [0n, 1n],
            [0n, 0n],
          ],
        ],
        want: 1,
      },
      { name: "zero for equal sequences", give: [[[0n, 1n]], [[0n, 1n]]], want: 0 },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        const [a, b] = tt.give as [bigint[][], bigint[][]];

        check.equal(seat, Math.sign(compareSequences(a, b)), tt.want, "the order");
      });
    }
  });
});
