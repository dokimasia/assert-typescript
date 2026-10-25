// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The generators of collections and text: lists, maps, strings, byte
 * strings, orderings and the strings that a pattern matches.
 */

import * as alphabet from "../engine/alphabet.js";
import { SequenceBounds } from "../engine/choice.js";
import { Sizes } from "../engine/collection.js";
import {
  BYTE_VALUES,
  Bytes,
  Dict,
  type Generator,
  List,
  Mapped,
  Matching,
  Permutation,
  Text,
} from "../engine/generator.js";
import { piece } from "../engine/pattern.js";
import { Pairs } from "../engine/value.js";
import { causeOf, merged, refuse } from "../generators.js";

/** Returns the sizes that options state, refusing sizes that admit no length. */
function sizesOf(call: string, options: SizeOption): Sizes {
  const lo = options.minSize ?? 0;
  const hi = options.maxSize;
  const whole =
    Number.isSafeInteger(lo) &&
    lo >= 0 &&
    (hi === undefined || Number.isSafeInteger(hi));
  if (!whole || (hi !== undefined && hi < lo)) {
    refuse(call, `states the sizes [${lo}, ${hi}], which admit no length`);
  }
  return new Sizes(lo, hi);
}

/** The sizes of a collection: the fewest and the most elements. */
export interface SizeOption {
  /** The fewest elements, 0 by default. */
  readonly minSize?: number;
  /** The most elements. Without it, the cap on choices per case bounds the size. */
  readonly maxSize?: number;
}

/** The options of a list. */
export interface ListOption extends SizeOption {
  /** Whether no two elements are equal. An element equal to an earlier one is discarded. */
  readonly unique?: boolean;
}

/** The options of a string. */
export interface StringOption extends SizeOption {
  /** The characters to draw from, the first the simplest. The default alphabet starts with the digits and the ASCII letters. */
  readonly alphabet?: string;
}

/**
 * Returns the generator of lists of of's values: per element a continue
 * choice and the element's choices, then a stop. A unique list discards an
 * element equal to an earlier one, and ten discards in a row stop it.
 *
 * @param of - The generator of the elements.
 * @param options - The sizes, and whether the elements are unique.
 * @returns The generator.
 * @throws RangeError for sizes that admit no length.
 */
export function list<T>(of: Generator<T>, ...options: ListOption[]): Generator<T[]> {
  const stated = merged(options);
  return new List(of, sizesOf("list", stated), stated.unique ?? false);
}

/**
 * Returns the generator of Maps from keys to values: per entry a continue
 * choice, the key's choices and the value's, then a stop. An entry whose key
 * equals an earlier key is discarded. A Map contains one of the keys +0 and -0,
 * which the definition counts as two keys.
 *
 * @param keys - The generator of the keys.
 * @param values - The generator of the values.
 * @param options - The sizes.
 * @returns The generator.
 * @throws RangeError for sizes that admit no length.
 */
export function dict<K, V>(
  keys: Generator<K>,
  values: Generator<V>,
  ...options: SizeOption[]
): Generator<Map<K, V>> {
  return new Mapped(
    new Dict(keys, values, sizesOf("dict", merged(options))),
    (pairs: Pairs) => new Map(pairs.items as readonly (readonly [K, V])[]),
    (value) => (value instanceof Map ? new Pairs([...value]) : (value as Pairs)),
  );
}

/**
 * Returns the generator of strings: one sequence of indices into the
 * alphabet. The default alphabet starts with the digits, the lowercase and
 * the uppercase letters, space and the ASCII punctuation, then every other
 * Unicode scalar value, so a string shrinks towards "0". A string never has
 * a lone surrogate.
 *
 * @param options - The sizes, and the alphabet.
 * @returns The generator.
 * @throws RangeError for sizes that admit no length, and for an alphabet
 *   that is empty, repeats a character or has a lone surrogate.
 */
export function string(...options: StringOption[]): Generator<string> {
  const stated = merged(options);
  const sizes = sizesOf("string", stated);
  if (stated.alphabet === undefined) {
    return new Text(
      undefined,
      new SequenceBounds(alphabet.SIZE, sizes.minSize, sizes.maxSize),
    );
  }
  const chars = [...stated.alphabet];
  const call = `string({ alphabet: ${JSON.stringify(stated.alphabet)} })`;
  if (chars.length === 0) {
    refuse(call, "states no character");
  }
  if (new Set(chars).size !== chars.length) {
    refuse(call, "repeats a character");
  }
  if (chars.some((c) => alphabet.indexOf(c) === undefined)) {
    refuse(call, "has a lone surrogate");
  }
  return new Text(
    chars,
    new SequenceBounds(chars.length, sizes.minSize, sizes.maxSize),
  );
}

/**
 * Returns the generator of byte strings: one sequence of 256 element values.
 *
 * @param options - The sizes.
 * @returns The generator.
 * @throws RangeError for sizes that admit no length.
 */
export function bytes(...options: SizeOption[]): Generator<Uint8Array> {
  const sizes = sizesOf("bytes", merged(options));
  return new Bytes(new SequenceBounds(BYTE_VALUES, sizes.minSize, sizes.maxSize));
}

/**
 * Returns the generator of orderings of values: one swap choice per
 * position, whose targets leave the values in their stated order.
 *
 * @param values - The values.
 * @returns The generator.
 */
export function permutation<T>(...values: readonly T[]): Generator<T[]> {
  return new Permutation(values);
}

/**
 * Returns the generator of the strings that a pattern of the portable subset
 * matches in full. An alternation chooses a branch, a quantifier its
 * repetitions as a collection, and a class a character by an index in the
 * order of the default alphabet, so `[A0a]` shrinks to `0`.
 *
 * @param pattern - A pattern of the portable subset.
 * @returns The generator.
 * @throws RangeError for a pattern outside the portable subset.
 */
export function stringMatching(pattern: string): Generator<string> {
  try {
    return new Matching(piece(pattern));
  } catch (err) {
    refuse(
      `stringMatching(${JSON.stringify(pattern)})`,
      `states no pattern of the portable subset: ${causeOf(err)}`,
    );
  }
}
