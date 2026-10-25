// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The searches of the passes of the shrinker: the largest count that a test
 * accepts, a bisection towards a target, and the roundings of a float to
 * fewer fractional bits.
 */

import type { FloatBounds } from "../choice.js";
import type { Work } from "../work.js";

/** The probes that findInteger makes one by one before it starts doubling. */
const LINEAR_PROBES = 4n;

/** Returns n × 2^-k rounded down, for k ≥ 0. */
function floorShift(n: bigint, k: number): bigint {
  return n >> BigInt(k);
}

/** Returns n × 2^-k rounded up, for k ≥ 0. */
function ceilShift(n: bigint, k: number): bigint {
  return -(-n >> BigInt(k));
}

/** Returns a float's exact value as numerator × 2^-bits, with bits the fractional bits of the value. */
function fractionOf(value: number): {
  readonly numerator: bigint;
  readonly bits: number;
} {
  let bits = 0;
  let scaled = value;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    bits += 1;
  }
  return { numerator: BigInt(scaled), bits };
}

/**
 * Returns a k with f(k) true and f(k + 1) false, given that f(0) is true.
 * It probes 1 to 4 in turn, then doubles until f fails, then bisects.
 */
export function* findInteger(f: (k: bigint) => Work<boolean>): Work<bigint> {
  for (let k = 1n; k <= LINEAR_PROBES; k += 1n) {
    if (!(yield* f(k))) {
      return k - 1n;
    }
  }
  let low = LINEAR_PROBES;
  let high = LINEAR_PROBES + 1n;
  while (yield* f(high)) {
    low = high;
    high *= 2n;
  }
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (yield* f(middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Tries position 0, then bisects towards the smallest position that at
 * accepts. at(p) runs the candidate at position p of an order whose position
 * 0 is the target, and reports whether it was accepted. position is the
 * current one. The result reports whether any candidate was accepted.
 */
export function* search(
  position: bigint,
  at: (p: bigint) => Work<boolean>,
): Work<boolean> {
  if (position === 0n) {
    return false;
  }
  if (yield* at(0n)) {
    return true;
  }
  let low = 0n;
  let high = position;
  let improved = false;
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (yield* at(middle)) {
      high = middle;
      improved = true;
    } else {
      low = middle;
    }
  }
  return improved;
}

/**
 * Yields a fraction rounded to fewer fractional bits, from 0 bits up. At
 * each number of bits it yields the value rounded towards the target, then
 * away from it, when the bounds admit them. An integral value, an infinity
 * and NaN yield nothing.
 */
export function* roundedFloats(value: number, bounds: FloatBounds): Iterable<number> {
  if (!Number.isFinite(value)) {
    return;
  }
  const { numerator, bits } = fractionOf(value);
  const downward = value > bounds.target;
  for (let fractionBits = 0; fractionBits < bits; fractionBits += 1) {
    const shift = bits - fractionBits;
    const roundings = downward ? [floorShift, ceilShift] : [ceilShift, floorShift];
    for (const rounding of roundings) {
      const candidate = Number(rounding(numerator, shift)) * 2 ** -fractionBits;
      if (bounds.admits(candidate)) {
        yield candidate;
      }
    }
  }
}
