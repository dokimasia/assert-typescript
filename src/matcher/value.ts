/**
 * The assertions about a value: equality, truth, size, text, numbers.
 *
 * Each takes a seat and a mode, so one implementation serves both
 * surfaces. A value of the wrong shape is reported like any other
 * failure rather than thrown, which is what keeps a mistaken argument
 * from ending a run with a stack trace instead of a message.
 */

import { equal as compare } from "./compare.js";
import { type Option, settings } from "./option.js";
import { type Mode, reportFailure, type Seat } from "./seat.js";

/** Whether a value can answer for its own length. */
function sized(value: unknown): number | undefined {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  if (value !== null && typeof value === "object") {
    return Object.keys(value as object).length;
  }
  return undefined;
}

/** The name to use for a value's type in a failure. */
function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Map) return "Map";
  if (value instanceof Set) return "Set";
  return typeof value;
}

/** Report that a value cannot answer the question asked of it. */
function unsupported(
  seat: Seat,
  mode: Mode,
  msg: string,
  assertion: string,
  detail: Record<string, unknown>,
): void {
  reportFailure(seat, mode, assertion, msg, detail);
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
    reportFailure(seat, mode, "equal", msg, { want, got });
  }
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
    reportFailure(seat, mode, "not-equal", msg, { got });
  }
}

/** Fail when the condition does not hold. */
export function isTrue(seat: Seat, mode: Mode, condition: boolean, msg: string): void {
  seat.helper();
  if (!condition) reportFailure(seat, mode, "true", msg);
}

/** Fail when the condition holds. */
export function isFalse(seat: Seat, mode: Mode, condition: boolean, msg: string): void {
  seat.helper();
  if (condition) reportFailure(seat, mode, "false", msg);
}

/** Fail when got is neither null nor undefined. */
export function isNil(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  if (got !== null && got !== undefined) {
    reportFailure(seat, mode, "nil", msg, { got });
  }
}

/** Fail when got is null or undefined. */
export function isNotNil(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  if (got === null || got === undefined) {
    reportFailure(seat, mode, "not-nil", msg);
  }
}

/** Fail when got does not hold want entries. */
export function length(
  seat: Seat,
  mode: Mode,
  got: unknown,
  want: number,
  msg: string,
): void {
  seat.helper();
  const size = sized(got);
  if (size === undefined) {
    unsupported(seat, mode, msg, "length", { want, got });
    return;
  }
  if (size !== want) {
    reportFailure(seat, mode, "length", msg, { want, got: size });
  }
}

/** Fail when got holds anything. */
export function isEmpty(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  const size = sized(got);
  if (size === undefined) {
    unsupported(seat, mode, msg, "empty", { length: got });
    return;
  }
  if (size !== 0) reportFailure(seat, mode, "empty", msg, { length: size });
}

/** Fail when got holds nothing. */
export function isNotEmpty(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  const size = sized(got);
  if (size === undefined) {
    unsupported(seat, mode, msg, "not-empty", {});
    return;
  }
  if (size === 0) reportFailure(seat, mode, "not-empty", msg);
}

/**
 * Whether haystack holds needle, and whether it could answer at all.
 *
 * What holding means follows the haystack: text holds a substring, a
 * `Map` or object holds a key, and any other collection holds an
 * element compared structurally.
 */
function holds(
  haystack: unknown,
  needle: unknown,
  options: Option[],
): { held: boolean; answered: boolean } {
  const relax = settings(options);
  const no = { held: false, answered: false };

  if (typeof haystack === "string") {
    if (typeof needle !== "string") return no;
    return { held: haystack.includes(needle), answered: true };
  }
  if (haystack instanceof Map) {
    return { held: haystack.has(needle), answered: true };
  }
  if (haystack instanceof Set) {
    return {
      held: [...haystack].some((item) => compare(item, needle, relax)),
      answered: true,
    };
  }
  if (Array.isArray(haystack)) {
    return {
      held: haystack.some((item) => compare(item, needle, relax)),
      answered: true,
    };
  }
  if (haystack !== null && typeof haystack === "object") {
    if (typeof needle !== "string") return no;
    return { held: Object.hasOwn(haystack, needle), answered: true };
  }
  return no;
}

/** Fail when haystack does not hold needle. */
export function contains(
  seat: Seat,
  mode: Mode,
  haystack: unknown,
  needle: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  const { held, answered } = holds(haystack, needle, options);
  if (!answered) {
    unsupported(seat, mode, msg, "contains", { haystack, needle });
    return;
  }
  if (!held) {
    reportFailure(seat, mode, "contains", msg, { haystack, needle });
  }
}

/** Fail when haystack holds needle. */
export function notContains(
  seat: Seat,
  mode: Mode,
  haystack: unknown,
  needle: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  const { held, answered } = holds(haystack, needle, options);
  if (!answered) {
    unsupported(seat, mode, msg, "not-contains", { haystack, needle });
    return;
  }
  if (held) {
    reportFailure(seat, mode, "not-contains", msg, { haystack, needle });
  }
}

/** Answer the text of a value, or undefined when it is not text. */
function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Report that an assertion needed text and was handed something else. */
function requiresText(
  seat: Seat,
  mode: Mode,
  msg: string,
  assertion: string,
  detail: Record<string, unknown>,
): void {
  reportFailure(seat, mode, assertion, msg, detail);
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
  const text = asText(got);
  if (text === undefined) {
    requiresText(seat, mode, msg, "has-prefix", { got, prefix });
    return;
  }
  if (!text.startsWith(prefix)) {
    reportFailure(seat, mode, "has-prefix", msg, { got: text, prefix });
  }
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
  const text = asText(got);
  if (text === undefined) {
    requiresText(seat, mode, msg, "has-suffix", { got, suffix });
    return;
  }
  if (!text.endsWith(suffix)) {
    reportFailure(seat, mode, "has-suffix", msg, { got: text, suffix });
  }
}

/** Fail when got does not match the pattern. */
export function matches(
  seat: Seat,
  mode: Mode,
  got: unknown,
  pattern: string,
  msg: string,
): void {
  seat.helper();
  const text = asText(got);
  if (text === undefined) {
    requiresText(seat, mode, msg, "matches", { got, pattern });
    return;
  }

  let expression: RegExp;
  try {
    expression = new RegExp(pattern);
  } catch (err) {
    reportFailure(seat, mode, "matches", msg, { got, pattern });
    return;
  }
  if (!expression.test(text)) {
    reportFailure(seat, mode, "matches", msg, { got: text, pattern });
  }
}

/** Fail when got does not hold every needle, in order. */
export function containsInOrder(
  seat: Seat,
  mode: Mode,
  got: unknown,
  needles: readonly string[],
  msg: string,
): void {
  seat.helper();
  const text = asText(got);
  if (text === undefined) {
    requiresText(seat, mode, msg, "contains-in-order", {
      haystack: got,
      needle: "",
      index: 0,
    });
    return;
  }

  let from = 0;
  // The index is the loop's own, not a lookup: a needle listed twice
  // would find its first position rather than the one that failed.
  for (const [index, needle] of needles.entries()) {
    const at = text.indexOf(needle, from);
    if (at < 0) {
      reportFailure(seat, mode, "contains-in-order", msg, {
        haystack: text,
        needle,
        index,
      });
      return;
    }
    from = at + needle.length;
  }
}

/** Answer a finite number, or undefined when the value is not one. */
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Report that an assertion needed a number and was handed something else. */
function requiresNumber(
  seat: Seat,
  mode: Mode,
  msg: string,
  assertion: string,
  detail: Record<string, unknown>,
): void {
  reportFailure(seat, mode, assertion, msg, detail);
}

/** Fail when got is further than tolerance from want. */
export function closeTo(
  seat: Seat,
  mode: Mode,
  got: unknown,
  want: number,
  tolerance: number,
  msg: string,
): void {
  seat.helper();
  const value = asNumber(got);
  if (value === undefined) {
    requiresNumber(seat, mode, msg, "close-to", { got, want, tolerance });
    return;
  }

  // Every comparison against NaN is false, so a bare `diff > tolerance`
  // would pass a NaN rather than reject it. Name the case instead.
  const diff = Math.abs(value - want);
  if (Number.isNaN(diff) || Number.isNaN(tolerance)) {
    reportFailure(seat, mode, "close-to", msg, { got, want, tolerance });
    return;
  }
  if (diff > tolerance) {
    reportFailure(seat, mode, "close-to", msg, { got, want, tolerance });
  }
}

/** Fail when got falls outside low to high. */
export function inRange(
  seat: Seat,
  mode: Mode,
  got: unknown,
  low: number,
  high: number,
  msg: string,
): void {
  seat.helper();
  const value = asNumber(got);
  if (value === undefined) {
    requiresNumber(seat, mode, msg, "in-range", { got, low, high });
    return;
  }
  if (low > high) {
    reportFailure(seat, mode, "in-range", msg, { got, low, high });
    return;
  }
  if (Number.isNaN(value) || !(value >= low && value <= high)) {
    reportFailure(seat, mode, "in-range", msg, { got, low, high });
  }
}
