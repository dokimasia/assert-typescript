/**
 * How a generated case draws each value from its random source.
 *
 * Every draw consumes the source in a fixed order, which the definition
 * fixes. The same seed gives the same values in every language only when
 * every implementation consumes the stream exactly as these functions do,
 * including the draws that they skip: equal bounds, a forced collection
 * flag and a range of one element consume nothing.
 */

import { type FloatBounds, IntegerBounds, type SequenceBounds } from "./choice.js";
import {
  fromBits,
  fromBits32,
  nextDown,
  nextUp,
  sameFloat,
  type Width,
} from "./float.js";
import type { Source } from "./source.js";

/** One integer draw in EDGE_ODDS takes an edge value. */
const EDGE_ODDS = 8n;

/**
 * A reusable integer draw takes an earlier value of its case with the same
 * bounds with odds 1 in REUSE_ODDS.
 */
export const REUSE_ODDS = 4n;

/**
 * The caps that an integer draw chooses its offset below, with even odds,
 * so that small offsets from the target are common and the draw can return
 * every value of the bounds.
 */
const OFFSET_CAPS = [1n << 4n, 1n << 8n, 1n << 16n, 1n << 64n] as const;

/** The average number of elements beyond its minimum that a collection with no closer maximum gets. */
const DEFAULT_EXTRA = 5;

/**
 * A float draw picks one of FLOAT_BRANCHES: branch 0 takes an edge value,
 * branches 1 to 3 an integral value, and the rest assemble the bits.
 */
const FLOAT_BRANCHES = 8n;
const FLOAT_LAST_INTEGRAL_BRANCH = 3n;

/** The magnitude below which every integer is a value of the width. */
const EXACT_INTEGERS: Readonly<Record<Width, number>> = { 32: 2 ** 24, 64: 2 ** 53 };

/** The widths of a float's exponent and mantissa fields. */
const EXPONENT_BITS: Readonly<Record<Width, bigint>> = { 32: 8n, 64: 11n };
const MANTISSA_BITS: Readonly<Record<Width, bigint>> = { 32: 23n, 64: 52n };

/** A probability in lowest terms: num/den. */
export interface Rational {
  /** The numerator. */
  readonly num: bigint;
  /** The denominator, at least 1. */
  readonly den: bigint;
}

/**
 * Returns the edge values of integer bounds: the target, lo, hi, one above
 * the target and one below it, in that order, each once, and only those
 * inside the bounds.
 *
 * @param bounds - The bounds.
 * @returns The edges.
 */
export function integerEdges(bounds: IntegerBounds): bigint[] {
  const target = bounds.target;
  const values: bigint[] = [];
  for (const value of [target, bounds.lo, bounds.hi, target + 1n, target - 1n]) {
    if (bounds.admits(value) && !values.includes(value)) values.push(value);
  }
  return values;
}

/**
 * Draws an integer inside the bounds. Equal bounds return their value and
 * consume nothing. Otherwise a coin of 1 in 8 decides whether the draw
 * takes an edge value, chosen with `below(number of edges)`. The rest move
 * away from the target: upward when the target is lo, downward when it is
 * hi, and by a coin of 1 in 2 when it lies strictly between them. The
 * offset is `below(min(span, cap − 1) + 1)`, where span is the distance to
 * the bound in that direction and cap is one of four caps, chosen with
 * `below(4)`.
 *
 * @param source - The case's source.
 * @param bounds - The bounds.
 * @returns The value.
 */
export function integer(source: Source, bounds: IntegerBounds): bigint {
  if (bounds.lo === bounds.hi) return bounds.lo;
  if (source.coin(1n, EDGE_ODDS)) {
    const values = integerEdges(bounds);
    return values[Number(source.below(BigInt(values.length)))] as bigint;
  }
  const target = bounds.target;
  let up: boolean;
  if (target === bounds.lo) up = true;
  else if (target === bounds.hi) up = false;
  else up = source.coin(1n, 2n);
  const span = up ? bounds.hi - target : target - bounds.lo;
  const cap = OFFSET_CAPS[Number(source.below(BigInt(OFFSET_CAPS.length)))] as bigint;
  const offset = source.below((span < cap - 1n ? span : cap - 1n) + 1n);
  return up ? target + offset : target - offset;
}

/**
 * Draws 1 with probability p and 0 otherwise, from one coin.
 *
 * @param source - The case's source.
 * @param p - The probability of 1.
 * @returns 1 or 0.
 */
export function boolean(source: Source, p: Rational): bigint {
  return source.coin(p.num, p.den) ? 1n : 0n;
}

/**
 * Draws an index with probability proportional to its weight. One weight
 * returns 0 and consumes nothing. Otherwise the draw is
 * `below(sum of the weights)`, and the index is the first whose running sum
 * of weights exceeds it.
 *
 * @param source - The case's source.
 * @param weights - The positive weights.
 * @returns The index.
 */
export function weighted(source: Source, weights: readonly bigint[]): number {
  if (weights.length === 1) return 0;
  const point = source.below(weights.reduce((sum, w) => sum + w, 0n));
  let total = 0n;
  return weights.findIndex((weight) => {
    total += weight;
    return point < total;
  });
}

/**
 * Decides whether swarm keeps an action: 1 keeps it, and 0 disables it.
 * kept states whether an earlier action is kept, and remaining counts this
 * action and the actions after it. Once an earlier action is kept, one coin
 * with the probability decides. While none is, the last action is kept and
 * consumes nothing. Before it, the draw tosses one coin for this action and
 * one for each later action, again until a coin comes up, and keeps the
 * action when its own coin came up.
 *
 * @param source - The case's source.
 * @param p - The probability that a coin comes up.
 * @param kept - Whether an earlier action is kept.
 * @param remaining - This action and the actions after it.
 * @returns 1 or 0.
 */
export function keep(
  source: Source,
  p: Rational,
  kept: boolean,
  remaining: number,
): bigint {
  if (kept) return boolean(source, p);
  if (remaining === 1) return 1n;
  for (;;) {
    const coins = Array.from({ length: remaining }, () => boolean(source, p));
    if (coins.includes(1n)) return coins[0] as bigint;
  }
}

/**
 * Returns the average length of a collection: min + min(max(min, 5),
 * ceil((max − min) / 2)), and min + max(min, 5) for an unbounded maximum.
 *
 * @param minSize - The fewest elements.
 * @param maxSize - The most elements, or undefined for no bound.
 * @returns The average, an integer.
 */
export function averageLength(minSize: number, maxSize: number | undefined): number {
  let extra = Math.max(minSize, DEFAULT_EXTRA);
  if (maxSize !== undefined)
    extra = Math.min(extra, Math.ceil((maxSize - minSize) / 2));
  return minSize + extra;
}

/** The bounds of a forced continue, a forced stop and a free decision. */
const FORCED_ON = new IntegerBounds(1n, 1n);
const FORCED_OFF = new IntegerBounds(0n, 0n);
const FREE = new IntegerBounds(0n, 1n);

/**
 * Returns the bounds of the decision whether a collection gets another
 * element: [1, 1] while count is below the minimum, [0, 0] once count is at
 * the maximum, and [0, 1] otherwise.
 *
 * @param count - The elements so far.
 * @param minSize - The fewest elements.
 * @param maxSize - The most elements, or undefined for no bound.
 * @returns The bounds.
 */
export function flagBounds(
  count: number,
  minSize: number,
  maxSize: number | undefined,
): IntegerBounds {
  if (count < minSize) return FORCED_ON;
  if (maxSize !== undefined && count >= maxSize) return FORCED_OFF;
  return FREE;
}

/**
 * Decides whether a collection with count elements gets another. A forced
 * decision returns the one value that its bounds allow and consumes
 * nothing. A free one continues by a coin of (average − min) in
 * (average − min + 1).
 *
 * @param source - The case's source.
 * @param count - The elements so far.
 * @param minSize - The fewest elements.
 * @param maxSize - The most elements, or undefined for no bound.
 * @param average - The average length.
 * @returns 1 to continue and 0 to stop.
 */
export function flag(
  source: Source,
  count: number,
  minSize: number,
  maxSize: number | undefined,
  average: number,
): bigint {
  const bounds = flagBounds(count, minSize, maxSize);
  if (bounds.lo === bounds.hi) return bounds.lo;
  const extra = BigInt(average - minSize);
  return source.coin(extra, extra + 1n) ? 1n : 0n;
}

/**
 * Returns the edge values of float bounds: the target, lo, hi, the next
 * value above the target and the next below it, in that order, each once,
 * and only those that the bounds admit, followed by NaN when the bounds
 * allow it.
 *
 * @param bounds - The bounds.
 * @returns The edges.
 */
export function floatEdges(bounds: FloatBounds): number[] {
  const target = bounds.target;
  const values: number[] = [];
  for (const value of [
    target,
    bounds.lo,
    bounds.hi,
    nextUp(target, bounds.width),
    nextDown(target, bounds.width),
  ]) {
    if (bounds.admits(value) && !values.some((v) => sameFloat(v, value))) {
      values.push(value);
    }
  }
  if (bounds.allowNan) values.push(Number.NaN);
  return values;
}

/**
 * Returns the integers that the bounds admit and that are exact values of
 * the width, or undefined when there are none, as for bounds of one
 * infinity.
 */
function integralBounds(bounds: FloatBounds): IntegerBounds | undefined {
  if (
    bounds.lo === Number.POSITIVE_INFINITY ||
    bounds.hi === Number.NEGATIVE_INFINITY
  ) {
    return undefined;
  }
  const limit = EXACT_INTEGERS[bounds.width] - 1;
  const lo = Math.max(Math.ceil(bounds.lo), -limit);
  const hi = Math.min(Math.floor(bounds.hi), limit);
  return lo > hi ? undefined : new IntegerBounds(BigInt(lo), BigInt(hi));
}

/**
 * Assembles a float from a sign, an exponent and a mantissa, drawn as
 * `below(2)`, `below(2^exponent bits)` and `below(2^mantissa bits)`, in that
 * order. A NaN becomes NaN when the bounds allow it and the target
 * otherwise. A value below lo becomes lo and one above hi becomes hi,
 * compared numerically, so the draw returns -0 as -0 when lo is +0.
 */
function fromParts(source: Source, bounds: FloatBounds): number {
  const exponentBits = EXPONENT_BITS[bounds.width];
  const mantissaBits = MANTISSA_BITS[bounds.width];
  const sign = source.below(2n);
  const exponent = source.below(1n << exponentBits);
  const mantissa = source.below(1n << mantissaBits);
  const bits =
    (sign << (exponentBits + mantissaBits)) | (exponent << mantissaBits) | mantissa;
  const value = bounds.width === 64 ? fromBits(bits) : fromBits32(bits);
  if (Number.isNaN(value)) return bounds.allowNan ? Number.NaN : bounds.target;
  if (value < bounds.lo) return bounds.lo;
  if (value > bounds.hi) return bounds.hi;
  return value;
}

/**
 * Draws a float inside the bounds. `below(8)` picks the branch. Branch 0
 * takes an edge value, chosen with `below(number of edges)`. Branches 1 to
 * 3 draw an integer, as integer does, over the integers that the bounds
 * admit and that are exact values of the width. The other branches, and an
 * integral branch whose bounds admit no such integer, assemble the value
 * from its bits.
 *
 * @param source - The case's source.
 * @param bounds - The bounds.
 * @returns The value.
 */
export function floatValue(source: Source, bounds: FloatBounds): number {
  const branch = source.below(FLOAT_BRANCHES);
  if (branch === 0n) {
    const values = floatEdges(bounds);
    return values[Number(source.below(BigInt(values.length)))] as number;
  }
  if (branch <= FLOAT_LAST_INTEGRAL_BRANCH) {
    const integral = integralBounds(bounds);
    if (integral !== undefined) return Number(integer(source, integral));
  }
  return fromParts(source, bounds);
}

/**
 * Draws a sequence inside the bounds. Each position first takes the
 * decision that flag makes for a collection, and when it continues, an
 * element drawn as `integer(0, k − 1)`. A byte string therefore consumes
 * the stream exactly as a list of integers in [0, 255] with the same sizes
 * does, and gets the same values.
 *
 * @param source - The case's source.
 * @param bounds - The bounds.
 * @returns The elements.
 */
export function sequence(source: Source, bounds: SequenceBounds): number[] {
  const average = averageLength(bounds.minSize, bounds.maxSize);
  const element = new IntegerBounds(0n, BigInt(bounds.k - 1));
  const elements: number[] = [];
  while (
    flag(source, elements.length, bounds.minSize, bounds.maxSize, average) === 1n
  ) {
    elements.push(Number(integer(source, element)));
  }
  return elements;
}
