// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertions of `soft` about one value: equality, truth, absence,
 * size, containment, text, numbers and order. Each records a failure and
 * lets the test continue.
 */

import type { Option } from "../matcher/option.js";
import * as order from "../matcher/order.js";
import { Mode, type Seat } from "../matcher/seat.js";
import * as text from "../matcher/text.js";
import * as value from "../matcher/value.js";

/** Every failure on this surface is recorded, not thrown. */
const MODE = Mode.Soft;

/**
 * Record a failure when got and want differ.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isEqualTo}.
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
 * Record a failure when got and want are equal.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isNotEqualTo}.
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
 * Record a failure when the condition does not hold.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isTrue}.
 */
export function isTrue(seat: Seat, condition: boolean, msg: string): void {
  seat.helper();
  value.isTrue(seat, MODE, condition, msg);
}

/**
 * Record a failure when the condition holds.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isFalse}.
 */
export function isFalse(seat: Seat, condition: boolean, msg: string): void {
  seat.helper();
  value.isFalse(seat, MODE, condition, msg);
}

/**
 * Record a failure when got is neither null nor undefined.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isNil}.
 */
export function isNil(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isNil(seat, MODE, got, msg);
}

/**
 * Record a failure when got is null or undefined.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isNotNil}.
 */
export function isNotNil(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isNotNil(seat, MODE, got, msg);
}

/**
 * Record a failure when got does not hold want entries.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.hasLength}.
 */
export function hasLength(seat: Seat, got: unknown, want: number, msg: string): void {
  seat.helper();
  value.length(seat, MODE, got, want, msg);
}

/**
 * Record a failure when got holds anything.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isEmpty}.
 */
export function isEmpty(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isEmpty(seat, MODE, got, msg);
}

/**
 * Record a failure when got holds nothing.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isNotEmpty}.
 */
export function isNotEmpty(seat: Seat, got: unknown, msg: string): void {
  seat.helper();
  value.isNotEmpty(seat, MODE, got, msg);
}

/**
 * Record a failure when haystack does not hold needle.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.doesContain}.
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
 * Record a failure when haystack holds needle.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.doesNotContain}.
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
 * Record a failure when got lacks a needle or has them out of order.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.containsInOrder}.
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
 * Record a failure when got does not start with prefix.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.hasPrefix}.
 */
export function hasPrefix(seat: Seat, got: unknown, prefix: string, msg: string): void {
  seat.helper();
  text.hasPrefix(seat, MODE, got, prefix, msg);
}

/**
 * Record a failure when got does not end with suffix.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.hasSuffix}.
 */
export function hasSuffix(seat: Seat, got: unknown, suffix: string, msg: string): void {
  seat.helper();
  text.hasSuffix(seat, MODE, got, suffix, msg);
}

/**
 * Record a failure when got does not match the pattern.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.doesMatch}.
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
 * Record a failure when got is further than tolerance from want.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isCloseTo}.
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
 * Record a failure when got falls outside low to high.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.inRange}.
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
 * Record a failure when an adjacent pair fails the predicate.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.pairwise}.
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
