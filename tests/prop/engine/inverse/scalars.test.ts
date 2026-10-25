// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the inverses of the generators that contain no other
 * generator.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { IntegerBounds, SequenceBounds } from "../../../../src/prop/engine/choice.js";
import {
  Bool,
  Bytes,
  type Generator,
  Integer,
  Just,
  Matching,
  Permutation,
  SampledFrom,
  Text,
} from "../../../../src/prop/engine/generator.js";
import { SCALARS } from "../../../../src/prop/engine/inverse/scalars.js";
import { piece } from "../../../../src/prop/engine/pattern.js";
import { test as it } from "../../../../src/vitest.js";
import { emittedBy, refusedBy } from "../../../helpers.js";

/** A digit. */
const DIGIT = new Integer(new IntegerBounds(0n, 9n));

/** A boolean that is true half of the time. */
const COIN = new Bool({ num: 1n, den: 2n });

/** Returns the values of the steps that the emitter of generator emits for value. */
function valuesOf(generator: Generator<unknown>, value: unknown): unknown[] {
  return emittedBy(SCALARS, generator, value)[0].map((s) => s.value);
}

describe("scalars", () => {
  describe("SCALARS", () => {
    it("lists the classes of the generators that contain no other generator", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        SCALARS.map(([kind]) => (kind as { name: string }).name),
        [
          "Integer",
          "Float",
          "Bool",
          "Just",
          "SampledFrom",
          "Text",
          "Bytes",
          "Matching",
          "Permutation",
        ],
        "the classes",
      );
    });

    it("emits an integer as one step of the value", ({ seat }) => {
      const [steps, normal] = emittedBy(SCALARS, DIGIT, 4n);

      check.isEqualTo(
        seat,
        [steps.map((s) => [s.bounds, s.value]), normal],
        [[[DIGIT.bounds, 4n]], 4n],
        "one step of 4 within the bounds of the digit",
      );
    });

    it("emits true as the choice 1", ({ seat }) => {
      check.isEqualTo(seat, valuesOf(COIN, true), [1n], "the choice 1");
    });

    it("refuses a value of another type for a boolean", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SCALARS, COIN, 1n),
        "prop: int:1 is no boolean",
        "the refusal",
      );
    });

    it("emits no step for the value of a just", ({ seat }) => {
      check.isEmpty(seat, valuesOf(new Just(4n), 4n), "no step");
    });

    it("refuses another value for a just", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SCALARS, new Just(4n), 5n),
        "prop: int:5 is not int:4",
        "the refusal",
      );
    });

    it("emits the index of a sampled value", ({ seat }) => {
      check.isEqualTo(
        seat,
        valuesOf(new SampledFrom(["a", "b"]), "b"),
        [1n],
        "the index 1",
      );
    });

    it("refuses a character outside the alphabet of a text", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SCALARS, new Text(["x"], new SequenceBounds(1)), "y"),
        'prop: string:"y" has a character outside the alphabet',
        "the refusal",
      );
    });

    it("refuses a value that is no bytes", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SCALARS, new Bytes(new SequenceBounds(256)), "ab"),
        'prop: string:"ab" is no bytes',
        "the refusal",
      );
    });

    it("refuses a string that a pattern matches only in part", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SCALARS, new Matching(piece("a")), "ab"),
        'prop: the pattern does not match string:"ab" in full',
        "the refusal",
      );
    });

    it("emits the swaps of a permutation", ({ seat }) => {
      check.isEqualTo(
        seat,
        valuesOf(new Permutation(["a", "b", "c"]), ["c", "a", "b"]),
        [2n, 2n],
        "the index of each swap",
      );
    });

    it("refuses a list that repeats a value of a permutation", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SCALARS, new Permutation(["a", "a", "b"]), ["a", "b", "b"]),
        'prop: list:[string:"a",string:"b",string:"b"] is no permutation of the values',
        "the refusal",
      );
    });
  });
});
