/**
 * The assertions about a value: equality, truth, size, text, numbers.
 *
 * Each takes a seat and a mode, so one implementation serves both
 * surfaces. A value of the wrong shape is reported like any other
 * failure rather than thrown, which is what keeps a mistaken argument
 * from ending a run with a stack trace instead of a message.
 */

import { compile } from "../pattern/match.js";
import { equal as compare } from "./compare.js";
import { type Option, settings } from "./option.js";
import type { Mode, Seat } from "./seat.js";
import { fail, pass } from "./verdict.js";

/** Reports whether value is a plain object, whose own keys are its entries. */
function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Returns the number of items of a value that has a length: the Unicode
 * scalar values of a string, the elements of an array or a typed array,
 * the entries of a `Map`, the members of a `Set`, and the own keys of a
 * plain object. A string with a lone surrogate, null and any other value
 * have no length.
 */
function lengthOf(value: unknown): number | undefined {
  if (typeof value === "string")
    return value.isWellFormed() ? [...value].length : undefined;
  if (Array.isArray(value)) return value.length;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return (value as unknown as ArrayLike<unknown>).length;
  }
  if (value instanceof Map || value instanceof Set) return value.size;
  if (isPlain(value)) return Object.keys(value).length;
  return undefined;
}

/** Fail when got and want differ. */
export function equal(
  seat: Seat,
  mode: Mode,
  got: unknown,
  want: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  if (!compare(got, want, settings(options))) {
    fail(seat, mode, "equal", msg, { want, got });
    return;
  }
  pass(seat, mode, "equal", msg);
}

/** Fail when got and want are equal. */
export function notEqual(
  seat: Seat,
  mode: Mode,
  got: unknown,
  want: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  if (compare(got, want, settings(options))) {
    fail(seat, mode, "not-equal", msg, { got });
    return;
  }
  pass(seat, mode, "not-equal", msg);
}

/** Fail when the condition does not hold. */
export function isTrue(seat: Seat, mode: Mode, condition: boolean, msg: string): void {
  seat.helper();
  if (!condition) {
    fail(seat, mode, "true", msg);
    return;
  }
  pass(seat, mode, "true", msg);
}

/** Fail when the condition holds. */
export function isFalse(seat: Seat, mode: Mode, condition: boolean, msg: string): void {
  seat.helper();
  if (condition) {
    fail(seat, mode, "false", msg);
    return;
  }
  pass(seat, mode, "false", msg);
}

/** Fail when got is neither null nor undefined. */
export function isNil(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  if (got !== null && got !== undefined) {
    fail(seat, mode, "nil", msg, { got });
    return;
  }
  pass(seat, mode, "nil", msg);
}

/** Fail when got is null or undefined. */
export function isNotNil(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  if (got === null || got === undefined) {
    fail(seat, mode, "not-nil", msg);
    return;
  }
  pass(seat, mode, "not-nil", msg);
}

/** Fail when got does not have want items. A value without a length fails with got null. */
export function length(
  seat: Seat,
  mode: Mode,
  got: unknown,
  want: number,
  msg: string,
): void {
  seat.helper();
  const size = lengthOf(got);
  if (size !== want) {
    fail(seat, mode, "length", msg, { want, got: size ?? null });
    return;
  }
  pass(seat, mode, "length", msg);
}

/** Fail when got has any item, or has no length. length is null for a value without one. */
export function isEmpty(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  const size = lengthOf(got);
  if (size !== 0) {
    fail(seat, mode, "empty", msg, { got, length: size ?? null });
    return;
  }
  pass(seat, mode, "empty", msg);
}

/** Fail when got has no item. A value without a length has none. */
export function isNotEmpty(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  const size = lengthOf(got) ?? 0;
  if (size === 0) {
    fail(seat, mode, "not-empty", msg, { got });
    return;
  }
  pass(seat, mode, "not-empty", msg);
}

/**
 * Whether haystack contains needle, and whether the question applies to
 * the haystack at all.
 *
 * What containing means follows the haystack: text contains a substring,
 * a `Map` a key and a plain object an own key, and an array, a typed
 * array or a `Set` an element. Keys and elements compare as
 * {@link equal} compares, so no NaN key is found without `equateNans`.
 */
function contained(
  haystack: unknown,
  needle: unknown,
  options: readonly Option[],
): { found: boolean; supported: boolean } {
  const relax = settings(options);
  const unsupported = { found: false, supported: false };
  const among = (items: Iterable<unknown>) => {
    for (const item of items) {
      if (compare(item, needle, relax)) return { found: true, supported: true };
    }
    return { found: false, supported: true };
  };

  if (typeof haystack === "string") {
    if (typeof needle !== "string") return unsupported;
    return { found: haystack.includes(needle), supported: true };
  }
  if (haystack instanceof Map) return among(haystack.keys());
  if (haystack instanceof Set || Array.isArray(haystack)) return among(haystack);
  if (ArrayBuffer.isView(haystack) && !(haystack instanceof DataView)) {
    return among(haystack as unknown as Iterable<unknown>);
  }
  if (isPlain(haystack)) {
    if (typeof needle !== "string") return unsupported;
    return { found: Object.hasOwn(haystack, needle), supported: true };
  }
  return unsupported;
}

/** Fail when haystack does not contain needle. */
export function contains(
  seat: Seat,
  mode: Mode,
  haystack: unknown,
  needle: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  if (!contained(haystack, needle, options).found) {
    fail(seat, mode, "contains", msg, { haystack, needle });
    return;
  }
  pass(seat, mode, "contains", msg);
}

/** Fail when haystack contains needle, or the question does not apply to it. */
export function notContains(
  seat: Seat,
  mode: Mode,
  haystack: unknown,
  needle: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  const { found, supported } = contained(haystack, needle, options);
  if (found || !supported) {
    fail(seat, mode, "not-contains", msg, { haystack, needle });
    return;
  }
  pass(seat, mode, "not-contains", msg);
}

/** Fail when got does not start with prefix. */
export function hasPrefix(
  seat: Seat,
  mode: Mode,
  got: unknown,
  prefix: string,
  msg: string,
): void {
  seat.helper();
  if (typeof got !== "string" || !got.startsWith(prefix)) {
    fail(seat, mode, "has-prefix", msg, { got, prefix });
    return;
  }
  pass(seat, mode, "has-prefix", msg);
}

/** Fail when got does not end with suffix. */
export function hasSuffix(
  seat: Seat,
  mode: Mode,
  got: unknown,
  suffix: string,
  msg: string,
): void {
  seat.helper();
  if (typeof got !== "string" || !got.endsWith(suffix)) {
    fail(seat, mode, "has-suffix", msg, { got, suffix });
    return;
  }
  pass(seat, mode, "has-suffix", msg);
}

/**
 * Fail when got does not match the pattern, a pattern of the portable
 * subset. A pattern outside the subset fails, with reason the text with
 * which the subset's parser refuses it. reason is null for a pattern
 * inside the subset.
 */
export function matches(
  seat: Seat,
  mode: Mode,
  got: unknown,
  pattern: string,
  msg: string,
): void {
  seat.helper();
  let expression: RegExp | undefined;
  let reason: string | null = null;
  try {
    expression = compile(pattern);
  } catch (err) {
    reason = (err as Error).message;
  }
  if (typeof got !== "string" || expression === undefined || !expression.test(got)) {
    fail(seat, mode, "matches", msg, { got, pattern, reason });
    return;
  }
  pass(seat, mode, "matches", msg);
}

/** Fail when got does not contain every needle, in order. */
export function containsInOrder(
  seat: Seat,
  mode: Mode,
  got: unknown,
  needles: readonly string[],
  msg: string,
): void {
  seat.helper();
  if (typeof got !== "string") {
    fail(seat, mode, "contains-in-order", msg, { haystack: got, needle: "", index: 0 });
    return;
  }

  let from = 0;
  // The index is the loop's own, not a lookup: a needle listed twice
  // would find its first position rather than the one that failed.
  for (const [index, needle] of needles.entries()) {
    const at = got.indexOf(needle, from);
    if (at < 0) {
      fail(seat, mode, "contains-in-order", msg, { haystack: got, needle, index });
      return;
    }
    from = at + needle.length;
  }
  pass(seat, mode, "contains-in-order", msg);
}

/** Returns a number or a bigint as a number, and undefined for any other value. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

/**
 * Fail when got is further than tolerance from want. A NaN fails, on
 * either side or as the tolerance, because no tolerance contains it.
 */
export function closeTo(
  seat: Seat,
  mode: Mode,
  got: unknown,
  want: number,
  tolerance: number,
  msg: string,
): void {
  seat.helper();
  const value = numberOf(got);
  // Every comparison against NaN is false, so a bare `diff > tolerance`
  // would pass a NaN rather than reject it.
  const diff = value === undefined ? Number.NaN : Math.abs(value - want);
  if (Number.isNaN(diff) || Number.isNaN(tolerance) || diff > tolerance) {
    fail(seat, mode, "close-to", msg, { got, want, tolerance });
    return;
  }
  pass(seat, mode, "close-to", msg);
}

/**
 * Fail when got falls outside low to high. A range whose low is above its
 * high, or whose bound is NaN, contains no number.
 */
export function inRange(
  seat: Seat,
  mode: Mode,
  got: unknown,
  low: number,
  high: number,
  msg: string,
): void {
  seat.helper();
  const value = numberOf(got);
  if (value === undefined || !(value >= low && value <= high)) {
    fail(seat, mode, "in-range", msg, { got, low, high });
    return;
  }
  pass(seat, mode, "in-range", msg);
}
