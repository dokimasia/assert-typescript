/**
 * The shortlex order of choice sequences, the one order that the shrinker
 * uses.
 *
 * A sequence is smaller than another when it is shorter, or equally long
 * and smaller in the first choice where the two differ. Choices of one kind
 * compare by their sort keys, and choices of different kinds by kind: an
 * integer, then a float, then a sequence.
 */

import type { Bounds, Value } from "./choice.js";
import { compareKeys, floatKey, type Key } from "./float.js";

/**
 * Returns the key of a choice under its bounds: its kind's rank, then its
 * sort key.
 *
 * @param bounds - The bounds of the request of the choice.
 * @param value - The choice's value, of the kind of bounds.
 * @returns The key.
 */
export function choiceKey(bounds: Bounds, value: Value): Key {
  switch (bounds.kind) {
    case "integer":
      return [0n, ...bounds.key(value as bigint)];
    case "float":
      return [1n, ...floatKey(value as number)];
    default: {
      const elements = value as readonly number[];
      return [2n, elements.length, ...elements];
    }
  }
}

/**
 * Compares two choice sequences in shortlex order: the shorter first, and of
 * two sequences of one length the one with the smaller key where they first
 * differ.
 *
 * @param a - The keys of a sequence's choices.
 * @param b - The keys of another sequence's choices.
 * @returns A negative number when a sorts first, a positive one when b
 *   does, and 0 for equal sequences.
 */
export function compareSequences(a: readonly Key[], b: readonly Key[]): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i += 1) {
    const order = compareKeys(a[i] as Key, b[i] as Key);
    if (order !== 0) return order;
  }
  return 0;
}
