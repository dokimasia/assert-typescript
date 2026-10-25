// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the passes of the shrinker that move values towards their
 * targets. Each case runs one pass on a failing case where that pass makes
 * progress, and checks the values of the best case after it.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../../../src/prop/engine/choice.js";
import { Bytes, Float, Integer } from "../../../../src/prop/engine/generator.js";
import {
  floatSimplify,
  minimizeChoice,
  minimizeDuplicates,
  sequenceLower,
} from "../../../../src/prop/engine/shrink/lowering.js";
import type { Shrinker } from "../../../../src/prop/engine/shrink.js";
import { drive, type Work } from "../../../../src/prop/engine/work.js";
import { test as it } from "../../../../src/vitest.js";
import { body, integers, shrinkerOf } from "../../../helpers.js";

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

describe("lowering", () => {
  describe("minimizeChoice", () => {
    it("moves an integer to the boundary of the failure by bisection", async ({
      seat,
    }) => {
      const large = body((c) => {
        if (c.draw(WIDE, "a") >= 1000n) {
          c.fail("large");
        }
      });

      check.isEqualTo(
        seat,
        await passed(minimizeChoice, large, integers(5000n)),
        [true, [1000n]],
        "1000",
      );
    });

    it("sets a float to its target when the failure allows it", async ({ seat }) => {
      const any = body((c) => {
        c.draw(new Float(new FloatBounds(0, 10)), "v");
        c.fail("any");
      });

      check.isEqualTo(
        seat,
        await passed(minimizeChoice, any, [{ kind: "float", value: 3.5 }]),
        [true, [0]],
        "0",
      );
    });
  });

  describe("sequenceLower", () => {
    it("moves each element of a sequence towards 0", async ({ seat }) => {
      const high = body((c) => {
        if ((c.draw(new Bytes(new SequenceBounds(256)), "bytes")[0] ?? 0) >= 100) {
          c.fail("high");
        }
      });

      check.isEqualTo(
        seat,
        await passed(sequenceLower, high, [{ kind: "sequence", value: [200, 9] }]),
        [true, [Uint8Array.of(100, 0)]],
        "100 and 0",
      );
    });
  });

  describe("minimizeDuplicates", () => {
    it("moves the choices that share a value towards the target together", async ({
      seat,
    }) => {
      const equal = body((c) => {
        const a = c.draw(WIDE, "a");
        if (a === c.draw(WIDE, "b") && a > 10n) {
          c.fail("equal");
        }
      });

      check.isEqualTo(
        seat,
        await passed(minimizeDuplicates, equal, integers(50n, 50n)),
        [true, [11n, 11n]],
        "11 and 11",
      );
    });
  });

  describe("floatSimplify", () => {
    it("rounds a float to fewer fractional bits", async ({ seat }) => {
      const big = body((c) => {
        if (c.draw(new Float(new FloatBounds(0, 10)), "v") > 2.5) {
          c.fail("big");
        }
      });

      check.isEqualTo(
        seat,
        await passed(floatSimplify, big, [{ kind: "float", value: 2.75 }]),
        [true, [3]],
        "3",
      );
    });

    it("moves an integral float towards an integral target as an integer", async ({
      seat,
    }) => {
      const big = body((c) => {
        if (c.draw(new Float(new FloatBounds(0, 100)), "v") > 7) {
          c.fail("big");
        }
      });

      check.isEqualTo(
        seat,
        await passed(floatSimplify, big, [{ kind: "float", value: 40 }]),
        [true, [8]],
        "8",
      );
    });
  });
});
