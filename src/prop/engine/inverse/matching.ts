// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The steps that the pattern of a string-matching generator takes to match
 * a string, for each way that the pattern matches it.
 */

import { IntegerBounds } from "../choice.js";
import { flagBounds } from "../draw.js";
import { Alternation, Class, Literal, type Repeat, Sequence } from "../pattern.js";
import type { Step } from "./steps.js";

/** Returns the one way that a literal or a class matches the character at at, or none. */
function single(
  piece: Literal | Class,
  chars: readonly string[],
  at: number,
): (readonly [number, Step[]])[] {
  const char = chars[at];
  if (char === undefined) {
    return [];
  }
  if (piece instanceof Literal) {
    return char === piece.char ? [[at + 1, []]] : [];
  }
  const offset = piece.offsetOf(char);
  if (offset === undefined) {
    return [];
  }
  const bounds = new IntegerBounds(0n, BigInt(piece.size - 1));
  return [[at + 1, [{ bounds, value: BigInt(offset) }]]];
}

/** Yields each way that the items match one after another from at. */
function* sequence(
  items: readonly unknown[],
  chars: readonly string[],
  at: number,
): Iterable<readonly [number, Step[]]> {
  if (items.length === 0) {
    yield [at, []];
    return;
  }
  for (const [middle, first] of matches(items[0], chars, at)) {
    for (const [end, rest] of sequence(items.slice(1), chars, middle)) {
      yield [end, [...first, ...rest]];
    }
  }
}

/**
 * Yields each way that the repetitions from count on match, the most first.
 * A repetition that matches nothing is not repeated beyond the minimum, so
 * the search ends.
 */
function* repeat(
  piece: Repeat,
  chars: readonly string[],
  at: number,
  count: number,
): Iterable<readonly [number, Step[]]> {
  const { sizes } = piece;
  const flag = flagBounds(count, sizes.minSize, sizes.maxSize);
  if (flag.hi === 1n) {
    for (const [middle, item] of matches(piece.item, chars, at)) {
      if (middle !== at || count < sizes.minSize) {
        for (const [end, rest] of repeat(piece, chars, middle, count + 1)) {
          yield [end, [{ bounds: flag, value: 1n }, ...item, ...rest]];
        }
      }
    }
  }
  if (flag.lo === 0n) {
    yield [at, [{ bounds: flag, value: 0n }]];
  }
}

/**
 * Yields each way that piece matches the characters from at: where it
 * ends, and its steps. The ways come in the order that a backtracking
 * engine tries them.
 *
 * @param piece - A piece of a pattern.
 * @param chars - The characters of the string.
 * @param at - The index of the first character that piece matches.
 * @returns The ways.
 */
export function* matches(
  piece: unknown,
  chars: readonly string[],
  at: number,
): Iterable<readonly [number, Step[]]> {
  if (piece instanceof Literal || piece instanceof Class) {
    yield* single(piece, chars, at);
  } else if (piece instanceof Sequence) {
    yield* sequence(piece.items, chars, at);
  } else if (piece instanceof Alternation) {
    for (const [index, branch] of piece.branches.entries()) {
      for (const [end, steps] of matches(branch, chars, at)) {
        yield [end, [{ bounds: piece.bounds, value: BigInt(index) }, ...steps]];
      }
    }
  } else {
    yield* repeat(piece as Repeat, chars, at, 0);
  }
}
