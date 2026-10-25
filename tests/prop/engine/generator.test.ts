// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the module of the generators: the generators that it
 * exports, and what each replays from the choices that it draws.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Generating, Replaying } from "../../../src/prop/engine/case/providers.js";
import { Rejected } from "../../../src/prop/engine/case/signals.js";
import { Case, DECODE } from "../../../src/prop/engine/case.js";
import {
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import { sameFloat } from "../../../src/prop/engine/float.js";
import * as base from "../../../src/prop/engine/generator/base.js";
import * as collections from "../../../src/prop/engine/generator/collections.js";
import * as scalars from "../../../src/prop/engine/generator/scalars.js";
import * as exported from "../../../src/prop/engine/generator.js";
import {
  Bool,
  Bytes,
  Dict,
  Filter,
  Float,
  type Generator,
  Integer,
  Just,
  List,
  Mapped,
  OneOf,
  Optional,
  Permutation,
  Recursive,
  SampledFrom,
  Text,
} from "../../../src/prop/engine/generator.js";
import { Source } from "../../../src/prop/engine/source.js";
import { canonical } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";

/** Seeds per check of generation. */
const SEEDS = 200;

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const TEEN = new Integer(new IntegerBounds(10n, 20n));
const COIN = new Bool({ num: 1n, den: 2n });
const LETTERS = new SampledFrom(["a", "b", "c"]);
const DIGITS = new List(DIGIT, new Sizes(0, 3));
const UNIQUE = new List(DIGIT, new Sizes(), true);
const TABLE = new Dict(DIGIT, COIN, new Sizes(0, 3));
const KEEP_EVEN = new Filter(DIGIT, (value) => value % 2n === 0n);

/** Returns a tree of digits: a digit, or a list of at most three trees. */
function tree(maxLeaves = 100): Recursive<unknown> {
  return new Recursive<unknown>(
    DIGIT,
    maxLeaves,
    (self) => new List(self, new Sizes(0, 3)),
  );
}

/** Returns the canonical value that generator decodes from c, or "rejected". */
function decoded(generator: Generator<unknown>, c: Case): string {
  try {
    return canonical(generator[DECODE](c));
  } catch (error) {
    if (error instanceof Rejected) {
      return "rejected";
    }
    throw error;
  }
}

describe("generator", () => {
  it("exports the generators of the modules base, collections and scalars", ({
    seat,
  }) => {
    check.isEqualTo(
      seat,
      { ...exported },
      { ...base, ...collections, ...scalars },
      "the exports of the three modules",
    );
  });

  {
    const every: [string, Generator<unknown>][] = [
      ["integer", DIGIT],
      [
        "float",
        new Float(
          new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true),
        ),
      ],
      ["boolean", new Bool({ num: 1n, den: 3n })],
      ["just", new Just(4n)],
      ["sampled-from", LETTERS],
      ["one-of", new OneOf([DIGIT, TEEN])],
      ["optional", new Optional(DIGIT)],
      ["list", DIGITS],
      ["unique list", UNIQUE],
      ["dict", TABLE],
      ["string", new Text(undefined, new SequenceBounds(0x10_f8_00, 0, 4))],
      ["alphabet", new Text(["x", "y", "z"], new SequenceBounds(3))],
      ["bytes", new Bytes(new SequenceBounds(256))],
      [
        "duration",
        new Integer(new IntegerBounds(-1_000_000_000n, 1_000_000_000n), "duration"),
      ],
      ["permutation", new Permutation(["a", "b", "c"])],
      ["recursive", tree()],
      ["filter", KEEP_EVEN],
      [
        "map",
        new Mapped(DIGITS, (values: bigint[]) =>
          [...values].sort((a, b) => Number(a - b)),
        ),
      ],
    ];
    for (const [name, generator] of every) {
      it(`replays a generated ${name} to the same value and choices`, ({ seat }) => {
        const differ = Array.from({ length: SEEDS }, (_, seed) => seed).filter(
          (seed) => {
            const generated = new Case(new Generating(new Source(BigInt(seed))));
            const value = decoded(generator, generated);
            const replayed = new Case(new Replaying(generated.choices));
            const again = decoded(generator, replayed);
            return (
              again !== value ||
              canonical(replayed.choices.map((one) => one.value)) !==
                canonical(generated.choices.map((one) => one.value))
            );
          },
        );

        check.isEmpty(seat, differ, "no seed replays to another value");
      });
    }

    it("draws no repeated element of a unique collection", ({ seat }) => {
      const repeats = Array.from({ length: SEEDS }, (_, seed) => {
        const elements = UNIQUE[DECODE](
          new Case(new Generating(new Source(BigInt(seed)))),
        );
        const entries = TABLE[DECODE](
          new Case(new Generating(new Source(BigInt(seed)))),
        );
        const keys = entries.items.map(([key]) => key);
        return (
          new Set(elements).size !== elements.length ||
          new Set(keys).size !== keys.length
        );
      }).filter(Boolean);

      check.isEmpty(seat, repeats, "no repeated element or key");
    });

    it("draws floats that the bounds of a float admit", ({ seat }) => {
      const bounds = new FloatBounds(-1, 1);
      const generator = new Float(bounds);
      const values = Array.from({ length: SEEDS }, (_, seed) =>
        generator[DECODE](new Case(new Generating(new Source(BigInt(seed))))),
      );

      check.isTrue(
        seat,
        values.every((value) => bounds.admits(value) && !sameFloat(value, Number.NaN)),
        "every float fits",
      );
    });
  }
});
