// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the passes of the shrinker that change two parts of the best
 * case at once. Each case runs one pass on a failing case where neither part
 * alone makes progress, and checks the values of the best case after it.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { type Choice, IntegerBounds } from "../../../../src/prop/engine/choice.js";
import { Sizes } from "../../../../src/prop/engine/collection.js";
import { Integer, List } from "../../../../src/prop/engine/generator.js";
import {
  deleteAndLower,
  lowerAndDelete,
  lowerTogether,
  redistribute,
} from "../../../../src/prop/engine/shrink/combined.js";
import type { Shrinker } from "../../../../src/prop/engine/shrink.js";
import { drive, type Work } from "../../../../src/prop/engine/work.js";
import { test as it } from "../../../../src/vitest.js";
import { body, integers, shrinkerOf } from "../../../helpers.js";

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const COUNT = new Integer(new IntegerBounds(0n, 3n));
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));

/** Runs a pass on the shrinker of a failing case, and returns whether it made progress and the best case's values. */
async function passed(
  pass: (shrinker: Shrinker) => Work<boolean>,
  of: ReturnType<typeof body>,
  choices: readonly Choice[],
): Promise<[boolean, unknown[]]> {
  const shrinker = await shrinkerOf(of, choices);
  const improved = await drive(pass(shrinker));
  return [improved, shrinker.best.execution.case.draws.map((one) => one.value)];
}

describe("combined", () => {
  describe("lowerAndDelete", () => {
    it("steps a count down with the deletion of a span that it sized", async ({
      seat,
    }) => {
      const five = body((c) => {
        const count = c.draw(COUNT, "n");
        const xs: bigint[] = [];
        for (let i = 0n; i < count; i += 1n) {
          xs.push(c.draw(DIGIT, "x"));
        }
        if (xs.includes(5n)) {
          c.fail("five");
        }
      });

      check.isEqualTo(
        seat,
        await passed(lowerAndDelete, five, integers(2n, 1n, 5n)),
        [true, [1n, 5n]],
        "a count of 1 and the digit 5",
      );
    });
  });

  describe("deleteAndLower", () => {
    it("steps an integer down with the deletion of earlier data", async ({ seat }) => {
      const related = body((c) => {
        const xs = c.draw(new List(DIGIT, new Sizes()), "xs");
        if (c.draw(WIDE, "n") === BigInt(xs.length) + 5n) {
          c.fail("related");
        }
      });

      check.isEqualTo(
        seat,
        await passed(deleteAndLower, related, integers(1n, 1n, 0n, 6n)),
        [true, [[], 5n]],
        "no element and 5",
      );
    });
  });

  describe("redistribute", () => {
    it("moves value from an integer to the next one with its bounds", async ({
      seat,
    }) => {
      const total = body((c) => {
        if (c.draw(WIDE, "a") + c.draw(WIDE, "b") >= 10n) {
          c.fail("total");
        }
      });

      check.isEqualTo(
        seat,
        await passed(redistribute, total, integers(6n, 4n)),
        [true, [0n, 10n]],
        "the sum on the second integer",
      );
    });
  });

  describe("lowerTogether", () => {
    it("lowers an integer and the next one with its bounds by one amount", async ({
      seat,
    }) => {
      const apart = body((c) => {
        const a = c.draw(WIDE, "a");
        if (c.draw(WIDE, "b") - a === 3n) {
          c.fail("apart");
        }
      });

      check.isEqualTo(
        seat,
        await passed(lowerTogether, apart, integers(5n, 8n)),
        [true, [0n, 3n]],
        "0 and 3",
      );
    });
  });
});
