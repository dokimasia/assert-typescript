// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the explain phase. Each explanation and each count of runs is
 * the result of the definition's reference implementation on the same body
 * and choices.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  type Case,
  DECODE,
  type Decoder,
  MAX_CHOICES,
} from "../../../../src/prop/engine/case.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
} from "../../../../src/prop/engine/choice.js";
import type { Body } from "../../../../src/prop/engine/execution.js";
import {
  Float,
  type Generator,
  Integer,
  Just,
  Mapped,
} from "../../../../src/prop/engine/generator.js";
import { explain, explainSeed } from "../../../../src/prop/engine/shrink/explain.js";
import { DEFAULT_BUDGET, Shrinker } from "../../../../src/prop/engine/shrink.js";
import { drive } from "../../../../src/prop/engine/work.js";
import { test as it } from "../../../../src/vitest.js";
import { body, executed, integers } from "../../../helpers.js";

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));
const UNIT = new Float(new FloatBounds(0, 10));
const SIGNED = new Integer(new IntegerBounds(-100n, 100n));
const JUST = new Just(7n);

/** A digit that rejects its case unless it is 7. */
const SEVEN: Decoder<bigint> = {
  [DECODE]: (c: Case) => {
    const value = DIGIT[DECODE](c);
    c.assume(value === 7n);
    return value;
  },
};

describe("explain", () => {
  describe("explainSeed", () => {
    it("returns the seed plus (draw + 1) × 2^32 plus the filling modulo 2^64", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        [
          explainSeed(7n, 0, 0),
          explainSeed(7n, 2, 3),
          explainSeed(2n ** 64n - 1n, 0, 1),
        ],
        [7n + 2n ** 32n, 7n + 3n * 2n ** 32n + 3n, 2n ** 32n],
        "three seeds",
      );
    });
  });

  describe("explain", () => {
    /** Returns the explanation of the failing case of choices from seed. */
    async function explained(
      of: Body,
      choices: Choice[],
      seed: bigint,
      budget = DEFAULT_BUDGET,
    ): Promise<[unknown[], number]> {
      const shrinker = new Shrinker(
        of,
        await executed(of, choices),
        MAX_CHOICES,
        budget,
      );
      const explanation = await drive(explain(shrinker, shrinker.best, seed));
      return [
        explanation.map((one) => [
          one.label,
          one.value,
          one.anyValueFails,
          one.nearest?.value,
        ]),
        shrinker.runs,
      ];
    }

    it("explains each draw of a failing case", async ({ seat }) => {
      const noisy = body((c) => {
        const value = c.draw(WIDE, "n");
        c.draw(WIDE, "noise");
        if (value > 1000n) {
          c.fail("above");
        }
      });

      check.isEqualTo(
        seat,
        await explained(noisy, integers(1001n, 3n), 7n),
        [
          [
            ["n", 1001n, false, 1000n],
            ["noise", 3n, true, undefined],
          ],
          7,
        ],
        "n's nearest passing value is 1000",
      );
    });

    it("reports no nearest value when the step fails another way", async ({ seat }) => {
      const limit = body((c) => {
        const value = c.draw(WIDE, "n");
        if (value > 1000n) {
          c.fail("above");
        }
        if (value === 1000n) {
          c.fail("limit");
        }
      });

      check.isEqualTo(
        seat,
        await explained(limit, integers(1001n), 7n),
        [[["n", 1001n, false, undefined]], 3],
        "1000 fails too",
      );
    });

    it("reports no nearest value for a draw at its target", async ({ seat }) => {
      const zero = body((c) => {
        if (c.draw(SIGNED, "v") === 0n) {
          c.fail("zero");
        }
      });

      check.isEqualTo(
        seat,
        await explained(zero, integers(0n), 7n),
        [[["v", 0n, false, undefined]], 1],
        "0 has no step towards 0",
      );
    });

    it("reports the nearest value above a draw below its target", async ({ seat }) => {
      const low = body((c) => {
        if (c.draw(SIGNED, "v") < -4n) {
          c.fail("low");
        }
      });

      check.isEqualTo(
        seat,
        await explained(low, integers(-5n), 7n),
        [[["v", -5n, false, -4n]], 3],
        "-4 passes",
      );
    });

    it("reports no explanation of a draw whose fillings decode no value", async ({
      seat,
    }) => {
      const always = body((c) => {
        c.draw(SEVEN, "seven");
        c.fail("always");
      });

      check.isEqualTo(
        seat,
        await explained(always, integers(7n), 7n),
        [[["seven", 7n, undefined, undefined]], 0],
        "no run",
      );
    });

    it("explains a draw from the fillings that decode", async ({ seat }) => {
      const always = body((c) => {
        c.draw(SEVEN, "seven");
        c.fail("always");
      });

      check.isEqualTo(
        seat,
        await explained(always, integers(7n), 11n),
        [[["seven", 7n, true, undefined]], 1],
        "one filling decodes",
      );
    });

    it("reports no explanation of a draw that makes no choice", async ({ seat }) => {
      const afterJust = body((c) => {
        c.draw(JUST, "j");
        if (c.draw(WIDE, "n") > 1000n) {
          c.fail("above");
        }
      });

      check.isEqualTo(
        seat,
        await explained(afterJust, integers(1001n), 7n),
        [
          [
            ["j", 7n, undefined, undefined],
            ["n", 1001n, false, 1000n],
          ],
          4,
        ],
        "the just is unexplained",
      );
    });

    it("reports the map of the nearest integer for a map of an integer", async ({
      seat,
    }) => {
      const wrapped = new Mapped(WIDE, (value: bigint) => `a${value}b`);
      const aboveWrapped = body((c) => {
        if (BigInt(c.draw(wrapped, "n").slice(1, -1)) > 1000n) {
          c.fail("above");
        }
      });
      const [explanation] = await explained(aboveWrapped, integers(1001n), 7n);

      check.isEqualTo(
        seat,
        (explanation[0] as unknown[]).slice(1),
        ["a1001b", false, "a1000b"],
        "the step wrapped in a and b",
      );
    });

    it("reports no nearest value for a draw that is no integer", async ({ seat }) => {
      const big = body((c) => {
        if (c.draw(UNIT, "v") > 2.5) {
          c.fail("bigger");
        }
      });
      const [explanation] = await explained(big, [{ kind: "float", value: 3 }], 7n);

      check.isEqualTo(
        seat,
        (explanation[0] as unknown[])[3],
        undefined,
        "no step of a float",
      );
    });

    it("leaves the draws unexplained once the budget is spent", async ({ seat }) => {
      const noisy = body((c) => {
        const value = c.draw(WIDE, "n");
        c.draw(WIDE, "noise");
        if (value > 1000n) {
          c.fail("above");
        }
      });

      check.isEqualTo(
        seat,
        await explained(noisy, integers(1001n, 3n), 7n, 0),
        [
          [
            ["n", 1001n, undefined, undefined],
            ["noise", 3n, undefined, undefined],
          ],
          0,
        ],
        "no run is left",
      );
    });

    it("throws an error of a filling's decode that is no signal", async ({ seat }) => {
      let decodes = 0;
      const brittle: Generator<bigint> = new Mapped(WIDE, (value: bigint) => {
        decodes += 1;
        if (decodes > 1) {
          throw new TypeError("the decode broke");
        }
        return value;
      });
      const once = body((c) => {
        c.draw(brittle, "n");
        c.fail("always");
      });
      const shrinker = new Shrinker(
        once,
        await executed(once, integers(5n)),
        MAX_CHOICES,
        10,
      );

      check.errorIs(
        seat,
        check.doesThrow(
          seat,
          () => explain(shrinker, shrinker.best, 7n).next(),
          "the filling throws",
        ),
        TypeError,
        "the decode's error",
      );
    });
  });
});
