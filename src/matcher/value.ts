/**
 * The assertions about a value: equality, truth, size, text, numbers.
 *
 * Each takes a seat and a mode, so one implementation serves both
 * surfaces. A value of the wrong shape is reported like any other
 * failure rather than thrown, which is what keeps a mistaken argument
 * from ending a run with a stack trace instead of a message.
 */

import { equal as compare } from "./compare.js";
import { show } from "./inspect.js";
import { type Option, settings } from "./option.js";
import { type Mode, report, type Seat } from "./seat.js";

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
  what: string,
  value: unknown,
): void {
  report(seat, mode, `${msg}: ${what} is not supported for ${typeName(value)}`);
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
    report(seat, mode, `${msg}: want ${show(want)}, got ${show(got)}`);
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
    report(seat, mode, `${msg}: values are equal, want different: got ${show(got)}`);
  }
}

/** Fail when the condition does not hold. */
export function isTrue(seat: Seat, mode: Mode, condition: boolean, msg: string): void {
  seat.helper();
  if (!condition) report(seat, mode, msg);
}

/** Fail when the condition holds. */
export function isFalse(seat: Seat, mode: Mode, condition: boolean, msg: string): void {
  seat.helper();
  if (condition) report(seat, mode, msg);
}

/** Fail when got is neither null nor undefined. */
export function isNil(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  if (got !== null && got !== undefined) {
    report(seat, mode, `${msg}: expected nothing, got ${show(got)}`);
  }
}

/** Fail when got is null or undefined. */
export function isNotNil(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  if (got === null || got === undefined) {
    report(seat, mode, `${msg}: expected something, got ${show(got)}`);
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
    unsupported(seat, mode, msg, "length", got);
    return;
  }
  if (size !== want) {
    report(seat, mode, `${msg}: expected length ${want}, got ${size}`);
  }
}

/** Fail when got holds anything. */
export function isEmpty(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  const size = sized(got);
  if (size === undefined) {
    unsupported(seat, mode, msg, "emptiness", got);
    return;
  }
  if (size !== 0) report(seat, mode, `${msg}: expected empty, got length ${size}`);
}

/** Fail when got holds nothing. */
export function isNotEmpty(seat: Seat, mode: Mode, got: unknown, msg: string): void {
  seat.helper();
  const size = sized(got);
  if (size === undefined) {
    unsupported(seat, mode, msg, "emptiness", got);
    return;
  }
  if (size === 0) report(seat, mode, `${msg}: expected non-empty, got length 0`);
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
    unsupported(seat, mode, msg, "containment", haystack);
    return;
  }
  if (!held) {
    report(seat, mode, `${msg}: ${show(haystack)} does not contain ${show(needle)}`);
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
    unsupported(seat, mode, msg, "containment", haystack);
    return;
  }
  if (held) {
    report(seat, mode, `${msg}: ${show(haystack)} contains ${show(needle)}`);
  }
}

/** Answer the text of a value, or undefined when it is not text. */
function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Report that an assertion needed text and was handed something else. */
function requiresText(seat: Seat, mode: Mode, msg: string, got: unknown): void {
  report(seat, mode, `${msg}: requires text, got ${typeName(got)}`);
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
    requiresText(seat, mode, msg, got);
    return;
  }
  if (!text.startsWith(prefix)) {
    report(seat, mode, `${msg}: ${show(text)} does not start with ${show(prefix)}`);
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
    requiresText(seat, mode, msg, got);
    return;
  }
  if (!text.endsWith(suffix)) {
    report(seat, mode, `${msg}: ${show(text)} does not end with ${show(suffix)}`);
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
    requiresText(seat, mode, msg, got);
    return;
  }

  let expression: RegExp;
  try {
    expression = new RegExp(pattern);
  } catch (err) {
    report(seat, mode, `${msg}: pattern ${show(pattern)} does not compile: ${err}`);
    return;
  }
  if (!expression.test(text)) {
    report(seat, mode, `${msg}: ${show(text)} does not match ${show(pattern)}`);
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
    requiresText(seat, mode, msg, got);
    return;
  }

  let from = 0;
  for (const needle of needles) {
    const at = text.indexOf(needle, from);
    if (at < 0) {
      report(seat, mode, `${msg}: ${show(needle)} does not follow what came before`);
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
function requiresNumber(seat: Seat, mode: Mode, msg: string, got: unknown): void {
  report(seat, mode, `${msg}: requires a number, got ${typeName(got)}`);
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
    requiresNumber(seat, mode, msg, got);
    return;
  }

  // Every comparison against NaN is false, so a bare `diff > tolerance`
  // would pass a NaN rather than reject it. Name the case instead.
  const diff = Math.abs(value - want);
  if (Number.isNaN(diff) || Number.isNaN(tolerance)) {
    report(
      seat,
      mode,
      `${msg}: ${show(got)} is not within ${tolerance} of ${want}: ` +
        "NaN is outside every tolerance",
    );
    return;
  }
  if (diff > tolerance) {
    report(seat, mode, `${msg}: ${show(got)} is not within ${tolerance} of ${want}`);
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
    requiresNumber(seat, mode, msg, got);
    return;
  }
  if (low > high) {
    report(seat, mode, `${msg}: [${low}, ${high}] is an empty range`);
    return;
  }
  if (Number.isNaN(value) || !(value >= low && value <= high)) {
    report(seat, mode, `${msg}: ${show(got)} is not in [${low}, ${high}]`);
  }
}
