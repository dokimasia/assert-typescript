/**
 * The binary floats of a float choice: their bits, their widths, their
 * neighbours and their sort key.
 *
 * A float choice has a width of 32 or 64 bits. A value of width 32 is a
 * `number` that `Math.fround` returns unchanged. The sort key orders the
 * values of a float choice from the simplest: integral values below 2^53
 * in magnitude by magnitude, then the other finite values by their number
 * of fractional bits and their numerator, then the infinities, then NaN.
 */

/** The widths of a float choice. */
export type Width = 32 | 64;

/** A sort key: compared element by element, and a prefix before a longer key. */
export type Key = readonly (number | bigint)[];

/** The canonical quiet NaN. Every NaN in a choice has these bits. */
export const NAN_BITS = 0x7ff8000000000000n;

/** Integral floats below this magnitude sort first, by magnitude. */
export const INTEGRAL_LIMIT = 2 ** 53;

/** The most fractional bits that a finite float of each width has. */
const MAX_FRACTION_BITS: Readonly<Record<Width, number>> = { 32: 149, 64: 1074 };

/** The bits of the significand of a binary64, the implicit bit included. */
const SIGNIFICAND_BITS = 53;

/** The values that a float's sort key starts with, one per group, simplest first. */
const GROUP_INTEGRAL = 0n;
const GROUP_FRACTION = 1n;
const GROUP_INFINITE = 2n;
const GROUP_NAN = 3n;

/** The buffer that every conversion between a float and its bits writes through. */
const VIEW = new DataView(new ArrayBuffer(8));

/**
 * Returns the IEEE 754 binary64 bits of x.
 *
 * @param x - The float.
 * @returns Its bits, as an unsigned 64-bit integer.
 */
export function bitsOf(x: number): bigint {
  VIEW.setFloat64(0, x, true);
  return VIEW.getBigUint64(0, true);
}

/**
 * Returns the binary64 float with the given bits.
 *
 * @param bits - An unsigned 64-bit integer.
 * @returns The float.
 */
export function fromBits(bits: bigint): number {
  VIEW.setBigUint64(0, bits, true);
  return VIEW.getFloat64(0, true);
}

/**
 * Returns the binary32 float with the given bits, as a number.
 *
 * @param bits - An unsigned 32-bit integer.
 * @returns The float.
 */
export function fromBits32(bits: bigint): number {
  VIEW.setUint32(0, Number(bits), true);
  return VIEW.getFloat32(0, true);
}

/** Returns the binary32 bits of x, a value of width 32. */
function bits32Of(x: number): number {
  VIEW.setFloat32(0, x, true);
  return VIEW.getUint32(0, true);
}

/**
 * Reports whether x is a value of a float of the width. NaN and the
 * infinities are values of both widths.
 *
 * @param x - The float.
 * @param width - The width.
 * @returns True when x is a value of the width.
 */
export function representable(x: number, width: Width): boolean {
  return width === 64 || Number.isNaN(x) || Math.fround(x) === x;
}

/**
 * Returns the smallest value of the width above x. Both zeros step to the
 * smallest positive subnormal, and positive infinity and NaN return
 * themselves.
 *
 * @param x - A value of the width.
 * @param width - The width.
 * @returns The next value up.
 */
export function nextUp(x: number, width: Width): number {
  if (Number.isNaN(x) || x === Number.POSITIVE_INFINITY) return x;
  if (x === 0) return width === 64 ? Number.MIN_VALUE : fromBits32(1n);
  if (width === 64) {
    const bits = bitsOf(x);
    return fromBits(x > 0 ? bits + 1n : bits - 1n);
  }
  const bits = bits32Of(x);
  return fromBits32(BigInt(x > 0 ? bits + 1 : bits - 1));
}

/**
 * Returns the largest value of the width below x.
 *
 * @param x - A value of the width.
 * @param width - The width.
 * @returns The next value down.
 */
export function nextDown(x: number, width: Width): number {
  return -nextUp(-x, width);
}

/** Returns the smallest value of the width that is x or more. */
function ceilWidth(x: number, width: Width): number {
  if (width === 64) return x;
  const rounded = Math.fround(x);
  return rounded >= x ? rounded : nextUp(rounded, width);
}

/**
 * Reports whether two floats are one value: every NaN is one value, and
 * -0 differs from +0.
 *
 * @param a - A float.
 * @param b - Another float.
 * @returns True for one value.
 */
export function sameFloat(a: number, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  return Object.is(a, b);
}

/** A finite float as an exact fraction: numerator × 2^exponent, the numerator odd or 0. */
interface Exact {
  readonly numerator: bigint;
  readonly exponent: number;
}

/** Returns the exact fraction of a finite float, in lowest terms. */
function exactOf(x: number): Exact {
  const bits = bitsOf(x);
  const negative = bits >> 63n === 1n;
  const field = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  let numerator = field === 0 ? fraction : fraction | (1n << 52n);
  let exponent = field === 0 ? -1074 : field - 1075;
  if (numerator === 0n) return { numerator: 0n, exponent: 0 };
  while ((numerator & 1n) === 0n) {
    numerator >>= 1n;
    exponent += 1;
  }
  return { numerator: negative ? -numerator : numerator, exponent };
}

/**
 * Returns the sort key of a float: a smaller key is a simpler value. From
 * simplest: integral values below 2^53 in magnitude, by magnitude; other
 * finite values, by their number of fractional bits and then their
 * numerator; the infinities; NaN. Within a group a positive value precedes
 * the negative value of equal magnitude, and +0 precedes -0.
 *
 * @param x - The float.
 * @returns Its key.
 */
export function floatKey(x: number): Key {
  if (Number.isNaN(x)) return [GROUP_NAN];
  const negative = x < 0 || Object.is(x, -0) ? 1n : 0n;
  if (!Number.isFinite(x)) return [GROUP_INFINITE, negative];
  const { numerator, exponent } = exactOf(x);
  const magnitude = numerator < 0n ? -numerator : numerator;
  if (exponent >= 0) {
    const whole = magnitude << BigInt(exponent);
    if (Math.abs(x) < INTEGRAL_LIMIT) return [GROUP_INTEGRAL, whole, negative];
    return [GROUP_FRACTION, 0n, whole, negative];
  }
  return [GROUP_FRACTION, BigInt(-exponent), magnitude, negative];
}

/**
 * Compares two sort keys element by element. A key that is a prefix of
 * another sorts first.
 *
 * @param a - A key.
 * @param b - Another key.
 * @returns A negative number when a sorts first, a positive one when b
 *   does, and 0 for equal keys.
 */
export function compareKeys(a: Key, b: Key): number {
  const shorter = Math.min(a.length, b.length);
  for (let i = 0; i < shorter; i += 1) {
    const x = a[i] as number | bigint;
    const y = b[i] as number | bigint;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length - b.length;
}

/** Returns the bit length of a positive integer. */
function bitLengthOf(n: bigint): number {
  return n.toString(2).length;
}

/**
 * Returns the smallest integer at or above numerator × 2^exponent, for a
 * positive odd numerator. An odd numerator is no multiple of 2^-exponent
 * when the exponent is negative, so the quotient rounds up.
 */
function ceilScaled(numerator: bigint, exponent: number): bigint {
  if (exponent >= 0) return numerator << BigInt(exponent);
  return (numerator >> BigInt(-exponent)) + 1n;
}

/** Reports whether n × 2^-f is above the exact value of the finite float bound. */
function above(n: bigint, f: number, bound: Exact): boolean {
  const shift = bound.exponent + f;
  if (shift >= 0) return n > bound.numerator << BigInt(shift);
  return n << BigInt(-shift) > bound.numerator;
}

/**
 * Returns the simplest integral value of the width in [lo, hi], for
 * 0 < lo <= hi < infinity, or undefined when the range contains none.
 */
function simplestIntegral(lo: number, hi: number, width: Width): number | undefined {
  const smallest = Math.ceil(lo);
  if (smallest < INTEGRAL_LIMIT) {
    const candidate = ceilWidth(smallest, width);
    if (candidate <= hi && candidate < INTEGRAL_LIMIT) return candidate;
  }
  // Every value of either width at 2^53 or above is an integer, and the
  // integers there precede every fraction.
  if (hi < INTEGRAL_LIMIT) return undefined;
  const candidate = ceilWidth(Math.max(lo, INTEGRAL_LIMIT), width);
  return candidate <= hi ? candidate : undefined;
}

/**
 * Returns the fraction of the width in [lo, hi] with the fewest fractional
 * bits and then the smallest numerator, for 0 < lo <= hi < infinity, or
 * undefined.
 *
 * A fraction n / 2^f in lowest terms has an odd n. At one f, the smallest
 * odd n in range has the fewest significant bits, so when it is not a value
 * of the width, no larger n at that f is either.
 */
function simplestFraction(lo: number, hi: number, width: Width): number | undefined {
  const low = exactOf(lo);
  const high = exactOf(hi);
  for (let f = 1; f <= MAX_FRACTION_BITS[width]; f += 1) {
    let n = ceilScaled(low.numerator, low.exponent + f);
    if (n % 2n === 0n) n += 1n;
    const candidate = Number(n) * 2 ** -f;
    if (
      !above(n, f, high) &&
      bitLengthOf(n) <= SIGNIFICAND_BITS &&
      representable(candidate, width)
    ) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Returns the simplest value of the width in [lo, hi], for 0 < lo <= hi, or
 * undefined. A range to infinity always contains an integer, so
 * simplestFraction runs for a finite range alone.
 */
function simplestPositive(lo: number, hi: number, width: Width): number | undefined {
  if (lo === Number.POSITIVE_INFINITY) return lo;
  return simplestIntegral(lo, hi, width) ?? simplestFraction(lo, hi, width);
}

/**
 * Returns the value of the width in [lo, hi] with the smallest sort key,
 * or undefined when the range contains no value of the width.
 *
 * @param lo - The lower bound, which may be an infinity.
 * @param hi - The upper bound, at least lo.
 * @param width - The width.
 * @returns The simplest value, or undefined.
 */
export function simplestFloat(
  lo: number,
  hi: number,
  width: Width,
): number | undefined {
  if (lo <= 0 && hi >= 0) return 0;
  if (lo > 0) return simplestPositive(lo, hi, width);
  const mirrored = simplestPositive(-hi, -lo, width);
  return mirrored === undefined ? undefined : -mirrored;
}
