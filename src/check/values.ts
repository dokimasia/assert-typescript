// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertions of `check` about one value: equality, truth, absence,
 * size, containment, text, numbers and order. Each stops the test at the
 * first failure.
 */

import type { Option } from "../matcher/option.js";
import * as order from "../matcher/order.js";
import { Mode, type Seat } from "../matcher/seat.js";
import * as text from "../matcher/text.js";
import * as value from "../matcher/value.js";

/** Every failure on this surface stops the test. */
const MODE = Mode.Fatal;

/**
 * Fail when got and want differ.
 *
 * Comparison is structural and reaches arrays, plain objects, `Map`,
 * `Set`, `Date`, `RegExp` and `Error`. Different shapes never compare.
 * An absent collection does not equal an empty one, and NaN does not
 * equal itself; pass `equateEmpty()` or `equateNans()` to relax either
 * for this call alone.
 *
 * @param seat Where the failure is reported.
 * @param got The value produced by the code under test.
 * @param want The value it is supposed to produce.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.isEqualTo(seat, store.get(id), item, "get returns the stored item");
 *
 * `want` is held to the type of `got`. Comparing across types is
 * almost always a mistake, and the few deliberate cases say so with
 * a cast: `check.isEqualTo(seat, got as unknown, want as unknown, msg)`.
 */
export function isEqualTo<T>(
  seat: Seat,
  got: T,
  want: NoInfer<T>,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  value.equal(seat, MODE, got, want, msg, ...options);
}

/**
 * Fail when got and want are equal.
 *
 * Comparison follows the rules of {@link isEqualTo}. The failure shows the
 * value the two shared, since printing one says everything.
 *
 * @param seat Where the failure is reported.
 * @param got The value produced by the code under test.
 * @param want The value it must not equal.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.isNotEqualTo(seat, token, previous, "refresh issues a new token");
 *
 * `want` is held to the type of `got`. Comparing across types is
 * almost always a mistake, and the few deliberate cases say so with
 * a cast: `check.isEqualTo(seat, got as unknown, want as unknown, msg)`.
 */
export function isNotEqualTo<T>(
  seat: Seat,
  got: T,
  want: NoInfer<T>,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  value.notEqual(seat, MODE, got, want, msg, ...options);
}

/**
 * Fail when the condition does not hold.
 *
 * The failure carries the message alone: a bare `false` says nothing
 * the message does not. Where a more specific assertion exists, it
 * will say more on failure than this one can.
 *
 * @param seat Where the failure is reported.
 * @param condition The condition that must hold.
 * @param msg The contract under test.
 * @example
 * check.isTrue(seat, user.active, "a new user starts active");
 */
export function isTrue(seat: Seat, condition: boolean, msg: string): void {
  seat.helper();
  value.isTrue(seat, MODE, condition, msg);
}

/**
 * Fail when the condition holds.
 *
 * @param seat Where the failure is reported.
 * @param condition The condition that must not hold.
 * @param msg The contract under test.
 * @example
 * check.isFalse(seat, cache.stale, "a fresh read is not stale");
 */
export function isFalse(seat: Seat, condition: boolean, msg: string): void {
  seat.helper();
  value.isFalse(seat, MODE, condition, msg);
}

/**
 * Fail when got is neither null nor undefined.
 *
 * JavaScript has two absent values and this accepts both, which is
 * what `nullish` means and what the `??` operator tests.
 *
 * @param seat Where the failure is reported.
 * @param got The value that must be absent.
 * @param msg The contract under test.
 * @example
 * check.isNil(seat, validate(name), "a good name is accepted");
 */
export function isNil(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isNil(seat, MODE, got, msg);
}

/**
 * Fail when got is null or undefined.
 *
 * Use it before reading properties of a value that may be absent: the
 * test stops here with your message rather than further down with a
 * TypeError nobody wrote.
 *
 * @param seat Where the failure is reported.
 * @param got The value that must be present.
 * @param msg The contract under test.
 * @example
 * check.isNotNil(seat, store.get(id), "get answers the stored item");
 */
export function isNotNil(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isNotNil(seat, MODE, got, msg);
}

/**
 * Fail when got does not hold want entries.
 *
 * Answers for a string, an array, a `Map`, a `Set` and a plain object.
 * A value with no length is itself the failure rather than a
 * TypeError, so a wrong type reads like every other failure.
 *
 * @param seat Where the failure is reported.
 * @param got The container to measure.
 * @param want How many entries it must hold.
 * @param msg The contract under test.
 * @example
 * check.length(seat, reply.items, 3, "every item comes back");
 */
export function hasLength(seat: Seat, got: unknown, want: number, msg: string): void {
  seat.helper();
  value.length(seat, MODE, got, want, msg);
}

/**
 * Fail when got holds anything.
 *
 * Empty is not absent. `null` has no length, so it fails here rather
 * than passing as empty.
 *
 * @param seat Where the failure is reported.
 * @param got The container that must hold nothing.
 * @param msg The contract under test.
 * @example
 * check.isEmpty(seat, reply.errors, "a valid request has no errors");
 */
export function isEmpty(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isEmpty(seat, MODE, got, msg);
}

/**
 * Fail when got holds nothing.
 *
 * @param seat Where the failure is reported.
 * @param got The container that must hold something.
 * @param msg The contract under test.
 * @example
 * check.isNotEmpty(seat, results, "the search finds something");
 */
export function isNotEmpty(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isNotEmpty(seat, MODE, got, msg);
}

/**
 * Fail when haystack does not hold needle.
 *
 * What holding means follows the haystack. A string holds a substring,
 * a `Map` or plain object holds a key, and an array or `Set` holds an
 * element compared by the rules of {@link isEqualTo}.
 *
 * @param seat Where the failure is reported.
 * @param haystack The container or text to search.
 * @param needle The element, key or substring to find.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.doesContain(seat, reply.headers, "etag", "the reply is cacheable");
 */
export function doesContain(
  seat: Seat,
  haystack: unknown,
  needle: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  value.contains(seat, MODE, haystack, needle, msg, ...options);
}

/**
 * Fail when haystack holds needle.
 *
 * Containment follows the rules of {@link doesContain}.
 *
 * @param seat Where the failure is reported.
 * @param haystack The container or text to search.
 * @param needle What must be absent.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.doesNotContain(seat, body, "password", "no secret leaks");
 */
export function doesNotContain(
  seat: Seat,
  haystack: unknown,
  needle: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  value.notContains(seat, MODE, haystack, needle, msg, ...options);
}

/**
 * Fail when got does not hold every needle, in order.
 *
 * Each needle is looked for after the previous one's match ends, so
 * the same text cannot satisfy two needles. Anything may sit between
 * them. An empty list of needles passes.
 *
 * @param seat Where the failure is reported.
 * @param got The text to search.
 * @param needles The substrings, in the order they must appear.
 * @param msg The contract under test.
 * @example
 * check.containsInOrder(seat, log, ["open", "close"], "it runs in order");
 */
export function containsInOrder(
  seat: Seat,
  got: unknown,
  needles: readonly string[],
  msg: string,
): void {
  seat.helper();
  text.containsInOrder(seat, MODE, got, needles, msg);
}

/**
 * Fail when got does not start with prefix.
 *
 * @param seat Where the failure is reported.
 * @param got The text to inspect.
 * @param prefix What it must start with.
 * @param msg The contract under test.
 * @example
 * check.hasPrefix(seat, requestId, "req_", "the id carries its prefix");
 */
export function hasPrefix(seat: Seat, got: unknown, prefix: string, msg: string): void {
  seat.helper();
  text.hasPrefix(seat, MODE, got, prefix, msg);
}

/**
 * Fail when got does not end with suffix.
 *
 * @param seat Where the failure is reported.
 * @param got The text to inspect.
 * @param suffix What it must end with.
 * @param msg The contract under test.
 * @example
 * check.hasSuffix(seat, path, ".json", "the export is JSON");
 */
export function hasSuffix(seat: Seat, got: unknown, suffix: string, msg: string): void {
  seat.helper();
  text.hasSuffix(seat, MODE, got, suffix, msg);
}

/**
 * Fail when got does not match the pattern.
 *
 * The pattern is searched rather than anchored: use `^` and `$` where
 * you mean the whole value. A pattern that does not compile is
 * reported as the failure, so a typo in a pattern does not read like a
 * failing subject.
 *
 * @param seat Where the failure is reported.
 * @param got The text to match.
 * @param pattern A regular expression source string.
 * @param msg The contract under test.
 * @example
 * check.doesMatch(seat, id, "^req_[0-9a-f]{16}$", "the id is well formed");
 */
export function doesMatch(
  seat: Seat,
  got: unknown,
  pattern: string,
  msg: string,
): void {
  seat.helper();
  text.matches(seat, MODE, got, pattern, msg);
}

/**
 * Fail when got is further than tolerance from want.
 *
 * The tolerance is an absolute difference and the bound is inclusive,
 * so a difference exactly equal to tolerance passes. This is the
 * assertion for a float, where exact equality is the wrong question.
 * NaN is outside every tolerance.
 *
 * @param seat Where the failure is reported.
 * @param got The number produced.
 * @param want The number it should be near.
 * @param tolerance The largest acceptable absolute difference.
 * @param msg The contract under test.
 * @example
 * check.isCloseTo(seat, elapsed, 1000, 50, "it waited about a second");
 */
export function isCloseTo(
  seat: Seat,
  got: unknown,
  want: number,
  tolerance: number,
  msg: string,
): void {
  seat.helper();
  value.closeTo(seat, MODE, got, want, tolerance, msg);
}

/**
 * Fail when got falls outside low to high.
 *
 * The interval is closed, so both bounds pass. A range with low above
 * high can hold nothing, and says so rather than reporting the value.
 * NaN is in no range.
 *
 * @param seat Where the failure is reported.
 * @param got The number to place.
 * @param low The lowest acceptable value.
 * @param high The highest acceptable value.
 * @param msg The contract under test.
 * @example
 * check.inRange(seat, reply.status, 200, 299, "the request succeeds");
 */
export function inRange(
  seat: Seat,
  got: unknown,
  low: number,
  high: number,
  msg: string,
): void {
  seat.helper();
  value.inRange(seat, MODE, got, low, high, msg);
}

/**
 * Fail when an adjacent pair does not satisfy the predicate.
 *
 * The predicate is called on every neighbouring pair in turn and must
 * answer true for each. Nought or one item passes, since neither has a
 * pair. The failure names the index where it broke.
 *
 * @param seat Where the failure is reported.
 * @param items The sequence to walk.
 * @param predicate Called as `predicate(earlier, later)` for each pair.
 * @param msg The contract under test.
 * @example
 * check.pairwise(seat, timestamps, (a, b) => a <= b, "the log is ordered");
 */
export function pairwise<T>(
  seat: Seat,
  items: readonly T[],
  predicate: (earlier: T, later: T) => boolean,
  msg: string,
): void {
  seat.helper();
  order.pairwise(seat, MODE, items, predicate, msg);
}
