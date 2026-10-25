// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the passes of the shrinker that change the spans of the best
 * case. Each case runs one pass on a failing case where that pass makes
 * progress, and checks the values of the best case after it.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { type Case, DECODE, type Decoder } from "../../../../src/prop/engine/case.js";
import {
  type Choice,
  IntegerBounds,
  SequenceBounds,
} from "../../../../src/prop/engine/choice.js";
import { Sizes } from "../../../../src/prop/engine/collection.js";
import { Bytes, Integer, Just, List } from "../../../../src/prop/engine/generator.js";
import {
  deleteSpan,
  deleteSpanChunk,
  deleteSpanRun,
  deleteStructurePair,
  liftDescendant,
  sequenceDelete,
  sortSiblings,
  targetSpan,
} from "../../../../src/prop/engine/shrink/spans.js";
import type { Shrinker } from "../../../../src/prop/engine/shrink.js";
import { drive, type Work } from "../../../../src/prop/engine/work.js";
import { test as it } from "../../../../src/vitest.js";
import { body, integers, shrinkerOf } from "../../../helpers.js";

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));
const DIGITS = new List(DIGIT, new Sizes());
const SEVENS = new List(new Just(7n), new Sizes());

/** A chain of digits: a digit, then a flag that decides whether a further chain follows, in one span. */
const CHAIN: Decoder<bigint[]> = {
  [DECODE]: (c: Case): bigint[] =>
    c.span("chain", () => {
      const value = DIGIT[DECODE](c);
      const more = c.integer(new IntegerBounds(0n, 1n), 0n) === 1n;
      return more ? [value, ...CHAIN[DECODE](c)] : [value];
    }),
};

/** A body that fails for a list of digits that contains 9. */
const nine = body((c) => {
  if (c.draw(DIGITS, "xs").includes(9n)) {
    c.fail("nine");
  }
});

/** Returns the values that the best case of a shrinker drew. */
function bestOf(shrinker: Shrinker): unknown[] {
  return shrinker.best.execution.case.draws.map((one) => one.value);
}

/** Runs a pass on the shrinker of a failing case, and returns whether it made progress and the best case's values. */
async function passed(
  pass: (shrinker: Shrinker) => Work<boolean>,
  of: ReturnType<typeof body>,
  choices: readonly Choice[],
): Promise<[boolean, unknown[]]> {
  const shrinker = await shrinkerOf(of, choices);
  const improved = await drive(pass(shrinker));
  return [improved, bestOf(shrinker)];
}

describe("spans", () => {
  describe("deleteSpanChunk", () => {
    it("deletes two consecutive siblings that the failure does not need", async ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        await passed(
          deleteSpanChunk,
          nine,
          integers(1n, 1n, 1n, 2n, 1n, 3n, 1n, 9n, 0n),
        ),
        [true, [[1n, 9n]]],
        "[1, 2, 3, 9] to [1, 9]",
      );
    });
  });

  describe("deleteSpan", () => {
    it("deletes one span at a time from the span that starts last", async ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        await passed(deleteSpan, nine, integers(1n, 1n, 1n, 9n, 0n)),
        [true, [[9n]]],
        "[1, 9] to [9]",
      );
    });
  });

  describe("liftDescendant", () => {
    it("replaces a span by a shorter descendant with the same label", async ({
      seat,
    }) => {
      const chained = body((c) => {
        if (c.draw(CHAIN, "chain").includes(9n)) {
          c.fail("nine");
        }
      });

      check.isEqualTo(
        seat,
        await passed(liftDescendant, chained, integers(1n, 1n, 9n, 0n)),
        [true, [[9n]]],
        "the inner chain [9] in place of [1, 9]",
      );
    });
  });

  describe("deleteSpanRun", () => {
    it("deletes as long a run of siblings as the failure allows", async ({ seat }) => {
      const pair = body((c) => {
        if (c.draw(SEVENS, "xs").length >= 2) {
          c.fail("two");
        }
      });

      check.isEqualTo(
        seat,
        await passed(deleteSpanRun, pair, integers(1n, 1n, 1n, 1n, 0n)),
        [true, [[7n, 7n]]],
        "four sevens to two",
      );
    });
  });

  describe("sequenceDelete", () => {
    it("deletes runs of elements of a sequence", async ({ seat }) => {
      const full = body((c) => {
        if (c.draw(new Bytes(new SequenceBounds(256)), "bytes").includes(255)) {
          c.fail("full");
        }
      });

      check.isEqualTo(
        seat,
        await passed(sequenceDelete, full, [
          { kind: "sequence", value: [1, 2, 3, 255] },
        ]),
        [true, [Uint8Array.of(255)]],
        "the byte 255 alone",
      );
    });
  });

  describe("deleteStructurePair", () => {
    it("deletes two adjacent continue flags", async ({ seat }) => {
      const any = body((c) => {
        if (c.draw(SEVENS, "xs").length > 0) {
          c.fail("some");
        }
      });

      check.isEqualTo(
        seat,
        await passed(deleteStructurePair, any, integers(1n, 1n, 1n, 0n)),
        [true, [[7n]]],
        "three sevens to one",
      );
    });
  });

  describe("targetSpan", () => {
    it("sets every choice of a span to its target", async ({ seat }) => {
      const large = body((c) => {
        const a = c.draw(WIDE, "a");
        c.draw(WIDE, "b");
        if (a > 10n) {
          c.fail("large");
        }
      });

      check.isEqualTo(
        seat,
        await passed(targetSpan, large, integers(50n, 7n)),
        [true, [50n, 0n]],
        "b to its target",
      );
    });
  });

  describe("sortSiblings", () => {
    it("swaps adjacent siblings when the later one is smaller", async ({ seat }) => {
      const pair = body((c) => {
        if (c.draw(DIGITS, "xs").length >= 2) {
          c.fail("two");
        }
      });

      check.isEqualTo(
        seat,
        await passed(sortSiblings, pair, integers(1n, 5n, 1n, 3n, 0n)),
        [true, [[3n, 5n]]],
        "[5, 3] to [3, 5]",
      );
    });
  });
});
