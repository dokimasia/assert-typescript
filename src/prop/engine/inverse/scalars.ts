// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The inverses of the generators that contain no other generator: integer,
 * float, boolean, just, sampled-from, text, bytes, string-matching and
 * permutation.
 */

import * as alphabet from "../alphabet.js";
import { IntegerBounds } from "../choice.js";
import {
  Bool,
  Bytes,
  Float,
  Integer,
  Just,
  Matching,
  Permutation,
  SampledFrom,
  Text,
} from "../generator.js";
import { canonical } from "../value.js";
import { matches } from "./matching.js";
import { CannotInvert, shown } from "./refusal.js";
import { BIT, type Emitter, indexOf, type Step, step } from "./steps.js";

/** The inverse of each generator that contains no other generator, by its class. */
export const SCALARS: readonly (readonly [unknown, Emitter])[] = [
  [Integer, (g: Integer, value) => [[step(g.bounds, value)], value]],
  [Float, (g: Float, value) => [[step(g.bounds, value)], value]],
  [
    Bool,
    (_g: Bool, value) => {
      if (typeof value !== "boolean") {
        throw new CannotInvert(`prop: ${shown(value)} is no boolean`);
      }
      return [[{ bounds: BIT, value: value ? 1n : 0n }], value];
    },
  ],
  [
    Just,
    (g: Just<unknown>, value) => {
      if (canonical(value) !== canonical(g.value)) {
        throw new CannotInvert(`prop: ${shown(value)} is not ${shown(g.value)}`);
      }
      return [[], value];
    },
  ],
  [
    SampledFrom,
    (g: SampledFrom<unknown>, value) => {
      const index = indexOf(g.values, value);
      const bounds = new IntegerBounds(0n, BigInt(g.values.length - 1));
      return [[{ bounds, value: BigInt(index) }], value];
    },
  ],
  [
    Text,
    (g: Text, value) => {
      if (typeof value !== "string") {
        throw new CannotInvert(`prop: ${shown(value)} is no string`);
      }
      const { characters } = g;
      const indices = [...value].map((char) =>
        characters === undefined ? alphabet.indexOf(char) : characters.indexOf(char),
      );
      if (indices.some((i) => i === undefined || i < 0)) {
        throw new CannotInvert(
          `prop: ${shown(value)} has a character outside the alphabet`,
        );
      }
      return [[step(g.bounds, indices)], value];
    },
  ],
  [
    Bytes,
    (g: Bytes, value) => {
      if (!(value instanceof Uint8Array)) {
        throw new CannotInvert(`prop: ${shown(value)} is no bytes`);
      }
      return [[step(g.bounds, [...value])], value];
    },
  ],
  [
    Matching,
    (g: Matching, value) => {
      if (typeof value !== "string") {
        throw new CannotInvert(`prop: ${shown(value)} is no string`);
      }
      const chars = [...value];
      for (const [end, steps] of matches(g.piece, chars, 0)) {
        if (end === chars.length) {
          return [steps, value];
        }
      }
      throw new CannotInvert(
        `prop: the pattern does not match ${shown(value)} in full`,
      );
    },
  ],
  [
    Permutation,
    (g: Permutation<unknown>, value) => {
      const current = [...g.values];
      if (!Array.isArray(value) || value.length !== current.length) {
        throw new CannotInvert(`prop: ${shown(value)} is no permutation of the values`);
      }
      const steps: Step[] = [];
      const last = current.length - 1;
      for (let i = 0; i < last; i += 1) {
        const j = i + indexOf(current.slice(i), value[i]);
        steps.push({
          bounds: new IntegerBounds(BigInt(i), BigInt(last)),
          value: BigInt(j),
        });
        [current[i], current[j]] = [current[j], current[i]];
      }
      if (canonical(current) !== canonical(value)) {
        throw new CannotInvert(`prop: ${shown(value)} is no permutation of the values`);
      }
      return [steps, value];
    },
  ],
];
