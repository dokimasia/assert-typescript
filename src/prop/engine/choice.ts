/**
 * The three kinds of choice that a case is made of.
 *
 * A choice is one typed decision within bounds: an integer, a float or a
 * sequence of small integers. Every choice has a target, the simplest value
 * that its bounds allow, and a sort key that orders its values from the
 * simplest. The shrinker moves values towards their targets, and accepts a
 * candidate only when the case gets shortlex-smaller under these keys.
 *
 * A replay hands a generator the value that a case recorded. When that
 * value is of another kind, or outside the bounds that the generator now
 * requests, the bounds coerce it: a sequence is cut, extended or cleaned,
 * and any other value becomes the target. Every prefix of a recorded case
 * is therefore a valid case.
 */

import {
  floatKey,
  type Key,
  representable,
  sameFloat,
  simplestFloat,
  type Width,
} from "./float.js";

/** The bounds of the signed and the unsigned 64-bit ranges. */
export const INT64_MIN = -(1n << 63n);
export const INT64_MAX = (1n << 63n) - 1n;
export const UINT64_MAX = (1n << 64n) - 1n;

/** One recorded decision: its kind and the value that the case used. */
export type Choice =
  | { readonly kind: "integer"; readonly value: bigint }
  | { readonly kind: "float"; readonly value: number }
  | { readonly kind: "sequence"; readonly value: readonly number[] };

/** The kind of a choice. */
export type Kind = Choice["kind"];

/** The value of a choice of any kind. */
export type Value = Choice["value"];

/** The bounds of a choice of any kind. */
export type Bounds = IntegerBounds | FloatBounds | SequenceBounds;

/**
 * Returns the choice of the kind of bounds with value.
 *
 * @param bounds - The bounds of the request of the choice.
 * @param value - A value of the kind of bounds.
 * @returns The choice.
 */
export function choiceOf(bounds: Bounds, value: Value): Choice {
  return { kind: bounds.kind, value } as Choice;
}

/** The bounds of an integer choice, both inclusive. */
export class IntegerBounds {
  /** The kind that these bounds take. */
  readonly kind = "integer";
  /** The smallest value. */
  readonly lo: bigint;
  /** The largest value. */
  readonly hi: bigint;
  /** The value closest to zero, which is zero when the bounds admit it. */
  readonly target: bigint;
  /** The text that bounds equal to these have. */
  readonly id: string;

  /**
   * Returns the bounds [lo, hi].
   *
   * @param lo - The smallest value.
   * @param hi - The largest value.
   * @throws RangeError for empty bounds, and for bounds inside neither the
   *   signed nor the unsigned 64-bit range.
   */
  constructor(lo: bigint, hi: bigint) {
    if (lo > hi) throw new RangeError(`prop: integer bounds [${lo}, ${hi}] are empty`);
    const signed = lo >= INT64_MIN && hi <= INT64_MAX;
    const unsigned = lo >= 0n && hi <= UINT64_MAX;
    if (!signed && !unsigned) {
      throw new RangeError(
        `prop: integer bounds [${lo}, ${hi}] are inside neither the signed nor the unsigned 64-bit range`,
      );
    }
    this.lo = lo;
    this.hi = hi;
    if (lo <= 0n && hi >= 0n) this.target = 0n;
    else this.target = lo > 0n ? lo : hi;
    this.id = `integer ${lo} ${hi}`;
  }

  /**
   * Returns the sort key of value: its distance to the target, then 1 when
   * it is below the target and 0 otherwise.
   *
   * @param value - A value inside the bounds.
   * @returns The key.
   */
  key(value: bigint): Key {
    const distance = value - this.target;
    return [distance < 0n ? -distance : distance, value < this.target ? 1n : 0n];
  }

  /**
   * Returns the position of value in the key order of the bounds. The
   * target is 0. The order runs one above the target, one below, two
   * above, two below, and so on, and continues on the longer side past the
   * bound of the shorter side.
   *
   * @param value - A value inside the bounds.
   * @returns The position.
   */
  rank(value: bigint): bigint {
    const target = this.target;
    const shorter = min(this.hi - target, target - this.lo);
    const distance = value > target ? value - target : target - value;
    if (distance > shorter) return shorter + distance;
    return value > target ? 2n * distance - 1n : 2n * distance;
  }

  /**
   * Returns the value at a position of the key order, the inverse of rank.
   *
   * @param rank - A position, from 0 to the number of values less one.
   * @returns The value.
   */
  atRank(rank: bigint): bigint {
    const target = this.target;
    const above = this.hi - target;
    const below = target - this.lo;
    const shorter = min(above, below);
    if (rank > 2n * shorter) {
      const distance = rank - shorter;
      return above > below ? target + distance : target - distance;
    }
    const distance = (rank + 1n) / 2n;
    return rank % 2n === 1n ? target + distance : target - distance;
  }

  /**
   * Reports whether value is an integer inside the bounds.
   *
   * @param value - Any value.
   * @returns True for a bigint in [lo, hi].
   */
  admits(value: unknown): value is bigint {
    return typeof value === "bigint" && value >= this.lo && value <= this.hi;
  }

  /**
   * Returns the recorded value when it fits, and the target otherwise.
   *
   * @param recorded - A choice that a case recorded.
   * @returns The value.
   */
  coerce(recorded: Choice): bigint {
    return recorded.kind === "integer" && this.admits(recorded.value)
      ? recorded.value
      : this.target;
  }
}

/** Returns the smaller of two integers. */
function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * The bounds of a float choice: an inclusive range, NaN and a width. An
 * infinite bound admits that infinity. NaN is a value only when allowNan
 * is set.
 */
export class FloatBounds {
  /** The kind that these bounds take. */
  readonly kind = "float";
  /** The smallest value, which may be negative infinity. */
  readonly lo: number;
  /** The largest value, which may be positive infinity. */
  readonly hi: number;
  /** Whether NaN is a value. */
  readonly allowNan: boolean;
  /** The width of the values. */
  readonly width: Width;
  /** The value in the bounds with the smallest sort key. */
  readonly target: number;
  /** The text that bounds equal to these have. */
  readonly id: string;

  /**
   * Returns the bounds [lo, hi] of floats of width.
   *
   * @param lo - The smallest value.
   * @param hi - The largest value.
   * @param allowNan - Whether NaN is a value.
   * @param width - 32 or 64.
   * @throws RangeError for a width other than 32 and 64, a bound that is
   *   NaN or no value of the width, and a lo above hi.
   */
  constructor(lo: number, hi: number, allowNan = false, width: Width = 64) {
    if (width !== 32 && width !== 64) {
      throw new RangeError(`prop: float width ${width} is neither 32 nor 64`);
    }
    if (Number.isNaN(lo) || Number.isNaN(hi) || lo > hi) {
      throw new RangeError(`prop: float bounds [${lo}, ${hi}] are empty`);
    }
    for (const bound of [lo, hi]) {
      if (!representable(bound, width)) {
        throw new RangeError(
          `prop: float bound ${bound} is no value of width ${width}`,
        );
      }
    }
    this.lo = lo;
    this.hi = hi;
    this.allowNan = allowNan;
    this.width = width;
    // lo is a value of the width inside [lo, hi], so the range has a simplest value.
    this.target = simplestFloat(lo, hi, width) as number;
    this.id = `float ${lo} ${hi} ${allowNan} ${width}`;
  }

  /**
   * Returns the sort key of value.
   *
   * @param value - A float.
   * @returns The key.
   */
  key(value: number): Key {
    return floatKey(value);
  }

  /**
   * Reports whether value is a float of the width inside the bounds, or
   * NaN where the bounds allow it.
   *
   * @param value - Any value.
   * @returns True for a value of the bounds.
   */
  admits(value: unknown): value is number {
    if (typeof value !== "number") return false;
    if (Number.isNaN(value)) return this.allowNan;
    return value >= this.lo && value <= this.hi && representable(value, this.width);
  }

  /**
   * Returns the recorded value when it fits, and the target otherwise. A
   * recorded NaN comes back as the canonical NaN, whatever its payload.
   *
   * @param recorded - A choice that a case recorded.
   * @returns The value.
   */
  coerce(recorded: Choice): number {
    if (recorded.kind !== "float" || !this.admits(recorded.value)) return this.target;
    return Number.isNaN(recorded.value) ? Number.NaN : recorded.value;
  }
}

/**
 * The bounds of a sequence choice: its element range and its length. Every
 * element is an integer in [0, k). A maxSize of undefined leaves the length
 * unbounded, and the cap on choices per case bounds it instead.
 */
export class SequenceBounds {
  /** The kind that these bounds take. */
  readonly kind = "sequence";
  /** The number of element values. */
  readonly k: number;
  /** The fewest elements. */
  readonly minSize: number;
  /** The most elements, or undefined for no bound. */
  readonly maxSize: number | undefined;
  /** The target: minSize zeros. */
  readonly target: readonly number[];
  /** The text that bounds equal to these have. */
  readonly id: string;

  /**
   * Returns the bounds of sequences of minSize to maxSize elements below k.
   *
   * @param k - The number of element values, at least 1.
   * @param minSize - The fewest elements.
   * @param maxSize - The most elements, or undefined for no bound.
   * @throws RangeError for a k below 1, a negative minSize, and a maxSize
   *   below minSize.
   */
  constructor(k: number, minSize = 0, maxSize?: number) {
    if (k < 1) throw new RangeError(`prop: a sequence with k = ${k} has no element`);
    if (minSize < 0 || (maxSize !== undefined && maxSize < minSize)) {
      throw new RangeError(`prop: sequence sizes [${minSize}, ${maxSize}] are empty`);
    }
    this.k = k;
    this.minSize = minSize;
    this.maxSize = maxSize;
    this.target = new Array<number>(minSize).fill(0);
    this.id = `sequence ${k} ${minSize} ${maxSize}`;
  }

  /**
   * Returns the sort key of value: its length, then its elements.
   *
   * @param value - A sequence.
   * @returns The key.
   */
  key(value: readonly number[]): Key {
    return [value.length, ...value];
  }

  /**
   * Reports whether value is a sequence that the bounds admit.
   *
   * @param value - Any value.
   * @returns True for an array of the sizes whose elements are in [0, k).
   */
  admits(value: unknown): value is readonly number[] {
    if (!Array.isArray(value) || value.length < this.minSize) return false;
    if (this.maxSize !== undefined && value.length > this.maxSize) return false;
    return value.every((e) => Number.isInteger(e) && e >= 0 && e < this.k);
  }

  /**
   * Fits a recorded sequence to the bounds. A longer sequence is cut to
   * maxSize, a shorter one is extended with zeros to minSize, and an
   * element outside [0, k) becomes 0. A value of another kind becomes the
   * target.
   *
   * @param recorded - A choice that a case recorded.
   * @returns The value.
   */
  coerce(recorded: Choice): readonly number[] {
    if (recorded.kind !== "sequence") return this.target;
    const elements = recorded.value.map((e) => (e >= 0 && e < this.k ? e : 0));
    const kept =
      this.maxSize === undefined ? elements : elements.slice(0, this.maxSize);
    while (kept.length < this.minSize) kept.push(0);
    return kept;
  }
}

/**
 * Reports whether two choices are one choice: the same kind and the same
 * value, with floats compared by sameFloat.
 *
 * @param a - A choice.
 * @param b - Another choice.
 * @returns True for one choice.
 */
export function sameChoice(a: Choice, b: Choice): boolean {
  if (a.kind === "float" && b.kind === "float") return sameFloat(a.value, b.value);
  if (a.kind === "sequence" && b.kind === "sequence") {
    return (
      a.value.length === b.value.length && a.value.every((e, i) => e === b.value[i])
    );
  }
  return a.kind === b.kind && a.value === b.value;
}
