/**
 * Structural equality, as the standard defines it.
 *
 * JavaScript's `===` answers a different question. It says two objects
 * with the same fields are different, and `Object.is` only fixes NaN
 * and signed zero. Neither reaches inside a value, which is what a
 * test asking whether a reply matches actually needs.
 */

import type { Relaxations } from "./option.js";

/** How deep a comparison walks before calling the value cyclic. */
const MAX_DEPTH = 100;

/** What a value is, for the purpose of comparing two of them. */
type Shape =
  | "primitive"
  | "array"
  | "map"
  | "set"
  | "date"
  | "regexp"
  | "error"
  | "object";

/** Answer which comparison rule a value falls under. */
function shapeOf(value: unknown): Shape {
  if (value === null || typeof value !== "object") return "primitive";
  if (Array.isArray(value)) return "array";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regexp";
  if (value instanceof Error) return "error";
  return "object";
}

/** Whether a value is a collection that can be empty. */
function isCollection(value: unknown): boolean {
  const shape = shapeOf(value);
  return shape === "array" || shape === "map" || shape === "set" || shape === "object";
}

/** Answer how many entries a collection holds. */
function sizeOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  return Object.keys(value as object).length;
}

/**
 * Whether one side is absent and the other an empty collection.
 *
 * Only ever true when the caller asked for it. Absent and empty are
 * different answers, and conflating them by default hides the case
 * where a field was never populated at all.
 */
function absentAgainstEmpty(a: unknown, b: unknown, relax: Relaxations): boolean {
  if (!relax.equateEmpty) return false;
  const absent = (v: unknown) => v === null || v === undefined;
  if (absent(a) && isCollection(b)) return sizeOf(b) === 0;
  if (absent(b) && isCollection(a)) return sizeOf(a) === 0;
  return false;
}

/**
 * Whether two values are structurally equal.
 *
 * Reaches inside arrays, plain objects, `Map`, `Set`, `Date`, `RegExp`
 * and `Error`. Different shapes never compare. A cycle stops the walk
 * rather than overflowing the stack.
 *
 * @param got The value produced by the code under test.
 * @param want The value it is supposed to produce.
 * @param relax The relaxations in force for this comparison.
 * @returns True when the two are equal under those rules.
 */
export function equal(got: unknown, want: unknown, relax: Relaxations): boolean {
  return walk(got, want, relax, 0, new Set());
}

/** Compare one level, then recurse. `seen` stops a cycle. */
function walk(
  a: unknown,
  b: unknown,
  relax: Relaxations,
  depth: number,
  seen: Set<unknown>,
): boolean {
  if (absentAgainstEmpty(a, b, relax)) return true;
  if (depth > MAX_DEPTH) return true;

  const shape = shapeOf(a);
  if (shape !== shapeOf(b)) return false;

  if (shape === "primitive") {
    if (typeof a === "number" && typeof b === "number") {
      if (Number.isNaN(a) && Number.isNaN(b)) return relax.equateNans;
      return a === b;
    }
    return Object.is(a, b) || a === b;
  }

  if (a === b) return true;
  if (seen.has(a)) return true;
  seen.add(a);
  try {
    return walkDeep(a, b, relax, depth, seen, shape);
  } finally {
    seen.delete(a);
  }
}

/** A recursive comparison, with the walk's state carried along. */
type Recurse = (a: unknown, b: unknown) => boolean;

/** Compare two arrays: same length, and equal at every index. */
function equalArrays(a: unknown[], b: unknown[], again: Recurse): boolean {
  return a.length === b.length && a.every((item, i) => again(item, b[i]));
}

/**
 * Compare two sets.
 *
 * A set is unordered, so each member needs a partner somewhere in the
 * other set rather than a counterpart at the same index. Members are
 * compared structurally, which is why this cannot just ask `has`.
 */
function equalSets(a: Set<unknown>, b: Set<unknown>, again: Recurse): boolean {
  if (a.size !== b.size) return false;

  const spare = [...b];
  return [...a].every((item) => {
    const at = spare.findIndex((candidate) => again(item, candidate));
    if (at < 0) return false;
    spare.splice(at, 1);
    return true;
  });
}

/**
 * Compare two maps: same size, same keys, equal values.
 *
 * Keys are matched by identity, the way `Map` itself looks them up. A
 * key that is only structurally equal to another map's key is a
 * different key, and pretending otherwise would disagree with every
 * read the subject does.
 */
function equalMaps(
  a: Map<unknown, unknown>,
  b: Map<unknown, unknown>,
  again: Recurse,
): boolean {
  if (a.size !== b.size) return false;

  for (const [key, value] of a) {
    if (!b.has(key)) return false;
    if (!again(value, b.get(key))) return false;
  }
  return true;
}

/** Compare two plain objects: same own keys, equal values. */
function equalObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  again: Recurse,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.hasOwn(b, k) && again(a[k], b[k]));
}

/** Compare the inside of two values already known to share a shape. */
function walkDeep(
  a: unknown,
  b: unknown,
  relax: Relaxations,
  depth: number,
  seen: Set<unknown>,
  shape: Shape,
): boolean {
  const again: Recurse = (x, y) => walk(x, y, relax, depth + 1, seen);

  switch (shape) {
    case "date":
      return (a as Date).getTime() === (b as Date).getTime();
    case "regexp":
      return String(a) === String(b);
    case "error":
      return (
        (a as Error).name === (b as Error).name &&
        (a as Error).message === (b as Error).message
      );
    case "array":
      return equalArrays(a as unknown[], b as unknown[], again);
    case "set":
      return equalSets(a as Set<unknown>, b as Set<unknown>, again);
    case "map":
      return equalMaps(a as Map<unknown, unknown>, b as Map<unknown, unknown>, again);
    default:
      return equalObjects(
        a as Record<string, unknown>,
        b as Record<string, unknown>,
        again,
      );
  }
}
