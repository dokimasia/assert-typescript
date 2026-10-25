// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the values of a generator for a seed. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { list } from "../../src/prop/generators/collections.js";
import { composite, integer } from "../../src/prop/generators.js";
import { values } from "../../src/prop/values.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** The integers that the definition's reference decodes from the first random cases of seed 42. */
const SEED_42 = [11, 0, 76, 0, 96, 11];

/** The lists of digits whose sum is above 10, of the first random cases of seed 7, without the rejected cases. */
const HEAVY_7 = [
  [0, 6, 8, 8],
  [2, 2, 9],
  [7, 4, 0, 5],
];

describe("values", () => {
  describe("values", () => {
    it("returns the values of the random cases of the seed", ({ seat }) => {
      check.isEqualTo(
        seat,
        values(integer(-100, 100), 42, 6),
        SEED_42,
        "the values of seed 42",
      );
    });

    it("returns the values of a seed stated as a bigint", ({ seat }) => {
      check.isEqualTo(
        seat,
        values(integer(-100, 100), 42n, 6),
        SEED_42,
        "the values of seed 42",
      );
    });

    it("returns the first values of a larger count", ({ seat }) => {
      check.isEqualTo(
        seat,
        values(integer(-100, 100), 42, 3),
        SEED_42.slice(0, 3),
        "the first three values",
      );
    });

    it("leaves out the cases that the generator rejects", ({ seat }) => {
      const heavy = list(integer(0, 9), { maxSize: 4 }).filter(
        (xs) => xs.reduce((a, b) => a + b, 0) > 10,
      );

      check.isEqualTo(seat, values(heavy, 7, 3), HEAVY_7, "the kept lists of seed 7");
    });

    it("returns no value for a count of 0", ({ seat }) => {
      check.isEqualTo(seat, values(integer(0, 9), 7, 0), [], "no value");
    });

    it("throws a RangeError for a count below 0", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => values(integer(0, 9), 7, -1)),
        "prop: values(generator, 7, -1) states no whole number of 0 or more",
        "values refuses -1",
      );
    });

    it("throws a RangeError for a seed outside [0, 2^64)", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => values(integer(0, 9), -1, 3)),
        "prop: values(generator, -1, 3) states no integer in [0, 2^64)",
        "values refuses the seed -1",
      );
    });

    it("throws for a generator that rejects more than ten cases for each value", ({
      seat,
    }) => {
      const never = integer(0, 9).filter(() => false);

      check.isEqualTo(
        seat,
        thrown(() => values(never, 7, 2)),
        "prop: values(generator, 7, 2) stops after the generator rejects 21 cases for 2 values",
        "values gives up",
      );
    });

    it("throws at a case that the generator skips", ({ seat }) => {
      const skipping = composite((c) => c.skip("the generator skips"));

      check.isEqualTo(
        seat,
        thrown(() => values(skipping, 7, 1)),
        "prop: values(generator, 7, 1) stops at a case that the generator skips: the generator skips",
        "values stops",
      );
    });

    it("passes on what the generator throws that is no rejection", ({ seat }) => {
      const broken = integer(0, 9).map(() => {
        throw new RangeError("the conversion refuses the value");
      });

      check.isEqualTo(
        seat,
        thrown(() => values(broken, 7, 1)),
        "the conversion refuses the value",
        "the error of the generator",
      );
    });
  });
});
