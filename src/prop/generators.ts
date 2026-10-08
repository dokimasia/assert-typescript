/**
 * The generators of the property engine.
 *
 * Each generator describes a domain and how to decode a value of it from a
 * case's choices, as the definition states. The same seed gives the same
 * values in every language, and a failing case shrinks to the same
 * counterexample. Options are objects whose fields state a generator's
 * parameters, merged in order.
 */

import { type Case, caseOf } from "./case.js";
import { durationOf, nanosecondsOf } from "./convert.js";
import * as alphabet from "./engine/alphabet.js";
import {
  FloatBounds,
  INT64_MAX,
  INT64_MIN,
  IntegerBounds,
  SequenceBounds,
  UINT64_MAX,
} from "./engine/choice.js";
import { Sizes } from "./engine/collection.js";
import type { Rational } from "./engine/draw.js";
import type { Width } from "./engine/float.js";
import {
  Bool,
  Bytes,
  Composite,
  Dict,
  Float,
  type Generator,
  Integer,
  Just,
  List,
  Mapped,
  Matching,
  OneOf,
  Optional,
  Permutation,
  Recursive,
  SampledFrom,
  Text,
} from "./engine/generator.js";
import { piece } from "./engine/pattern.js";
import { Pairs } from "./engine/value.js";

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

/** The options of a float. */
export interface FloatOption {
  /** Whether NaN is a value, false by default. */
  readonly allowNan?: boolean;
  /** The width of the values, 64 by default. A value of width 32 is a number that Math.fround returns unchanged. */
  readonly width?: 32 | 64;
}

/** The options of a boolean. */
export interface BooleanOption {
  /** The probability of true, as [numerator, denominator], 1/2 by default. */
  readonly p?: readonly [number | bigint, number | bigint];
}

/** The options of a recursive generator. */
export interface RecursiveOption {
  /** The values that one value may draw from the base, at least 1 and 100 by default. */
  readonly maxLeaves?: number;
}

/** Returns the options merged in order, a later field over an earlier one. */
function merged<T extends object>(options: readonly T[]): T {
  return Object.assign({}, ...options) as T;
}

/** Throws a RangeError that names the call and states what its arguments lack. */
function refuse(call: string, reason: string): never {
  throw new RangeError(`prop: ${call} ${reason}`);
}

/** Returns the message of an error of the engine without its package's prefix. */
function causeOf(err: unknown): string {
  return (err as Error).message.replace(/^prop: /, "");
}

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

/** Returns the bigint of an integer that a number states, which must be safe. */
function exact(call: string, value: number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value))
    refuse(call, `states ${value}, which is no safe integer`);
  return BigInt(value);
}

/**
 * Returns the generator of the integers in [lo, hi]: one integer choice,
 * whose target is the value closest to zero. Bounds given as numbers return
 * numbers and must be safe integers. Bounds given as bigints return bigints,
 * inside the signed or the unsigned 64-bit range. The choices are the same
 * for both.
 *
 * @param lo - The smallest value.
 * @param hi - The largest value.
 * @returns The generator.
 * @throws RangeError for bounds that state no value, a number that is no
 *   safe integer, and bounds of two types.
 */
export function integer(lo: number, hi: number): Generator<number>;
export function integer(lo: bigint, hi: bigint): Generator<bigint>;
export function integer(
  lo: number | bigint,
  hi: number | bigint,
): Generator<number | bigint> {
  const call = `integer(${lo}, ${hi})`;
  if (typeof lo !== typeof hi) refuse(call, "states bounds of two types");
  const low = exact(call, lo);
  const high = exact(call, hi);
  const signed = low >= INT64_MIN && high <= INT64_MAX;
  const unsigned = low >= 0n && high <= UINT64_MAX;
  if (low > high || !(signed || unsigned)) refuse(call, "states no value");
  const choice = new Integer(new IntegerBounds(low, high));
  const numbers = typeof lo === "number";
  return new Mapped(
    choice,
    (value: bigint) => (numbers ? Number(value) : value),
    (value) => (typeof value === "number" ? exact(call, value) : (value as bigint)),
  );
}

/**
 * Returns the generator of the floats in [lo, hi]: one float choice, whose
 * target is the simplest value in range. A bound may be an infinity, and NaN
 * is a value only when allowNan states it.
 *
 * @param lo - The smallest value.
 * @param hi - The largest value.
 * @param options - Whether NaN is a value, and the width.
 * @returns The generator.
 * @throws RangeError for bounds that contain no value of the width.
 */
export function float(
  lo: number,
  hi: number,
  ...options: FloatOption[]
): Generator<number> {
  const { allowNan = false, width = 64 } = merged(options);
  try {
    return new Float(new FloatBounds(lo, hi, allowNan, width as Width));
  } catch (err) {
    refuse(`float(${lo}, ${hi})`, `states no value: ${causeOf(err)}`);
  }
}

/**
 * Returns the generator of booleans: one integer choice in [0, 1], true with
 * probability p, whose target is false.
 *
 * @param options - The probability of true.
 * @returns The generator.
 * @throws RangeError for a probability outside [0, 1].
 */
export function boolean(...options: BooleanOption[]): Generator<boolean> {
  const { p = [1n, 2n] } = merged(options);
  const call = `boolean({ p: [${p[0]}, ${p[1]}] })`;
  const num = exact(call, p[0]);
  const den = exact(call, p[1]);
  if (num < 0n || den < 1n || num > den) refuse(call, "states no probability");
  let [a, b] = [num, den];
  while (b !== 0n) [a, b] = [b, a % b];
  const reduced: Rational = { num: num / a, den: den / a };
  return new Bool(reduced);
}

/**
 * Returns the generator of value alone. It makes no choice.
 *
 * @param value - The value.
 * @returns The generator.
 */
export function just<T>(value: T): Generator<T> {
  return new Just(value);
}

/**
 * Returns the generator of one of values: an integer index that decides
 * structure, whose target is the first value.
 *
 * @param values - The values, at least one.
 * @returns The generator.
 * @throws RangeError for no value.
 */
export function sampledFrom<T>(...values: readonly T[]): Generator<T> {
  if (values.length === 0) refuse("sampledFrom()", "states no value");
  return new SampledFrom(values);
}

/**
 * Returns the generator of a value of one of generators: an index that
 * decides structure, then that generator's choices. Its target is the first
 * generator's simplest value.
 *
 * @param generators - The alternatives, at least one.
 * @returns The generator.
 * @throws RangeError for no generator.
 */
export function oneOf<T>(...generators: readonly Generator<T>[]): Generator<T> {
  if (generators.length === 0) refuse("oneOf()", "states no generator");
  return new OneOf(generators);
}

/**
 * Returns the generator of a value of of, or undefined: a presence choice,
 * then the value when present. Its target is absent.
 *
 * @param of - The generator of the value.
 * @returns The generator.
 */
export function optional<T>(of: Generator<T>): Generator<T | undefined> {
  return new Optional(of);
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
  if (chars.length === 0) refuse(call, "states no character");
  if (new Set(chars).size !== chars.length) refuse(call, "repeats a character");
  if (chars.some((c) => alphabet.indexOf(c) === undefined))
    refuse(call, "has a lone surrogate");
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
  return new Bytes(new SequenceBounds(256, sizes.minSize, sizes.maxSize));
}

/**
 * Returns the generator of durations in [lo, hi]: one integer choice of
 * nanoseconds, whose target is the duration closest to zero. A day counts 24
 * hours, and a duration balances its time from the hours down.
 *
 * @param lo - The shortest duration.
 * @param hi - The longest duration.
 * @returns The generator.
 * @throws RangeError for bounds that state no duration, a bound with a
 *   calendar unit, and bounds outside ±(2^63 − 1) nanoseconds.
 */
export function duration(
  lo: Temporal.Duration,
  hi: Temporal.Duration,
): Generator<Temporal.Duration> {
  const call = `duration(${lo}, ${hi})`;
  if ([lo, hi].some((d) => d.years !== 0 || d.months !== 0 || d.weeks !== 0)) {
    refuse(call, "states a calendar unit");
  }
  const low = nanosecondsOf(lo);
  const high = nanosecondsOf(hi);
  if (low > high || low < INT64_MIN || high > INT64_MAX)
    refuse(call, "states no duration");
  return new Mapped(
    new Integer(new IntegerBounds(low, high), "duration"),
    durationOf,
    (value) =>
      value instanceof Temporal.Duration ? nanosecondsOf(value) : (value as bigint),
  );
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

/**
 * Returns the generator of recursive values: at each position the base or
 * an extension, whose positions are recursive values in turn. Once a value
 * has drawn maxLeaves values from the base, every further position takes the
 * base. Its target is the base's simplest value.
 *
 * @param base - The generator of a leaf.
 * @param extend - Returns the extension from the generator of one position.
 * @param options - The most leaves of a value.
 * @returns The generator.
 * @throws RangeError for a maxLeaves below 1.
 */
export function recursive<T>(
  base: Generator<T>,
  extend: (self: Generator<T>) => Generator<T>,
  ...options: RecursiveOption[]
): Generator<T> {
  const { maxLeaves = 100 } = merged(options);
  if (!Number.isSafeInteger(maxLeaves) || maxLeaves < 1) {
    refuse(`recursive({ maxLeaves: ${maxLeaves} })`, "states no count of 1 or more");
  }
  return new Recursive(base, maxLeaves, extend);
}

/**
 * Returns the generator of the values that f returns. f draws from other
 * generators through the case that it receives, in one span around them all.
 * It has no inverse, so an example of it runs on its value.
 *
 * @param f - The function, which draws from its case.
 * @returns The generator.
 */
export function composite<T>(f: (c: Case) => T): Generator<T> {
  return new Composite((engine) => f(caseOf(engine)));
}
