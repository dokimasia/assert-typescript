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
  | "boxed"
  | "array"
  | "typed"
  | "map"
  | "set"
  | "date"
  | "regexp"
  | "error"
  | "object";

/** The constructors of the boxed primitives. */
const BOXES: readonly unknown[] = [Number, String, Boolean, BigInt, Symbol];

/** Answer which comparison rule a value falls under. */
function shapeOf(value: unknown): Shape {
  if (value === null || typeof value !== "object") return "primitive";
  if (BOXES.some((box) => value instanceof (box as abstract new () => object))) {
    return "boxed";
  }
  if (Array.isArray(value)) return "array";
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return "typed";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regexp";
  if (value instanceof Error) return "error";
  return "object";
}

/** Whether a value is a reference: an object, an array or a function. */
function isReference(value: unknown): boolean {
  return typeof value === "function" || (typeof value === "object" && value !== null);
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

/** Compares two primitives: no coercion, NaN unequal to itself unless relaxed, -0 equal to +0. */
function equalPrimitives(a: unknown, b: unknown, relax: Relaxations): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return relax.equateNans;
    return a === b;
  }
  return Object.is(a, b) || a === b;
}

/**
 * Whether two values are structurally equal.
 *
 * Reaches inside arrays, typed arrays, plain objects, `Map`, `Set`,
 * `Date`, `RegExp`, `Error` and boxed primitives. Different shapes never
 * compare. A map's keys compare by these rules, so no NaN key matches
 * without `equateNans`, and -0 and +0 are one key. A cycle stops the walk
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
  if (relax.byIdentity && isReference(a) && isReference(b)) return a === b;
  if (depth > MAX_DEPTH) return true;

  const shape = shapeOf(a);
  if (shape !== shapeOf(b)) return false;
  if (shape === "primitive") return equalPrimitives(a, b, relax);

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
function equalArrays(
  a: ArrayLike<unknown>,
  b: ArrayLike<unknown>,
  again: Recurse,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!again(a[i], b[i])) return false;
  }
  return true;
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
 * Compare two maps: the same size, and a one-to-one matching of their
 * entries, in which each entry of a takes the first unmatched entry of b
 * whose key and value equal its own.
 *
 * Keys compare by the rules of {@link equal}, not as `Map` looks them up:
 * `Map` finds a NaN key and compares an object key by identity.
 */
function equalMaps(
  a: Map<unknown, unknown>,
  b: Map<unknown, unknown>,
  again: Recurse,
): boolean {
  if (a.size !== b.size) return false;

  const spare = [...b];
  for (const [key, value] of a) {
    const at = spare.findIndex(([k, v]) => again(key, k) && again(value, v));
    if (at < 0) return false;
    spare.splice(at, 1);
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
    case "boxed":
      return (
        (a as object).constructor === (b as object).constructor &&
        equalPrimitives((a as object).valueOf(), (b as object).valueOf(), relax)
      );
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
    case "typed":
      return (
        (a as object).constructor === (b as object).constructor &&
        equalArrays(a as ArrayLike<unknown>, b as ArrayLike<unknown>, again)
      );
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
