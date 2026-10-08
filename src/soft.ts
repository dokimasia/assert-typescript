/**
 * Assertions that record a failure and let the test carry on.
 *
 * Named for what vitest already calls this: `expect.soft` records
 * rather than stopping. The name `expect` is taken by every test
 * runner's own global, so importing another one would shadow it.
 *
 * ```ts
 * import { soft } from "@dokimi/assert";
 *
 * test("reply", ({ seat }) => {
 *   soft.hasPrefix(seat, reply.body, "{", "the body is JSON");
 *   soft.length(seat, reply.items, 3, "every item comes back");
 * });
 * ```
 *
 * Everything recorded is reported when the test body ends, so one run
 * shows every property that failed. The members, their signatures and
 * their comparison rules are those of `check`; only what happens on a
 * failure differs.
 */

import type { Cancellable } from "./matcher/behaviour.js";
import * as behaviour from "./matcher/behaviour.js";
import type { ErrorClass } from "./matcher/errors.js";
import * as errors from "./matcher/errors.js";
import type { Option } from "./matcher/option.js";
import * as order from "./matcher/order.js";
import { track } from "./matcher/pending.js";
import * as raising from "./matcher/raises.js";
import type { Count, Sequence } from "./matcher/relation.js";
import * as relation from "./matcher/relation.js";
import { Mode, type Seat } from "./matcher/seat.js";
import * as value from "./matcher/value.js";
import * as waiting from "./matcher/waiting.js";

/** Every failure on this surface is recorded, not thrown. */
const MODE = Mode.Soft;

/**
 * Record a failure when got and want differ.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.equal}.
 *
 * `want` is held to the type of `got`. Comparing across types is
 * almost always a mistake, and the few deliberate cases say so with
 * a cast: `check.equal(seat, got as unknown, want as unknown, msg)`.
 */
export function equal<T>(
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
 * comparison rules are those of {@link check.notEqual}.
 *
 * `want` is held to the type of `got`. Comparing across types is
 * almost always a mistake, and the few deliberate cases say so with
 * a cast: `check.equal(seat, got as unknown, want as unknown, msg)`.
 */
export function notEqual<T>(
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
 * comparison rules are those of {@link check.length}.
 */
export function length(seat: Seat, got: unknown, want: number, msg: string): void {
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
 * comparison rules are those of {@link check.contains}.
 */
export function contains(
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
 * comparison rules are those of {@link check.notContains}.
 */
export function notContains(
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
  value.containsInOrder(seat, MODE, got, needles, msg);
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
  value.hasPrefix(seat, MODE, got, prefix, msg);
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
  value.hasSuffix(seat, MODE, got, suffix, msg);
}

/**
 * Record a failure when got does not match the pattern.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.matches}.
 */
export function matches(seat: Seat, got: unknown, pattern: string, msg: string): void {
  seat.helper();
  value.matches(seat, MODE, got, pattern, msg);
}

/**
 * Record a failure when got is further than tolerance from want.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.closeTo}.
 */
export function closeTo(
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

/**
 * Record a failure when an error is present.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.noError}.
 */
export function noError(seat: Seat, err: unknown, msg: string): void {
  seat.helper();
  errors.noError(seat, MODE, err, msg);
}

/**
 * Record a failure when no error is present.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.hasError}.
 */
export function hasError(seat: Seat, err: unknown, msg: string): void {
  seat.helper();
  errors.hasError(seat, MODE, err, msg);
}

/**
 * Record a failure when err does not match target.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.errorIs}.
 */
export function errorIs(seat: Seat, err: unknown, target: unknown, msg: string): void {
  seat.helper();
  errors.errorIs(seat, MODE, err, target, msg);
}

/**
 * Record a failure when err matches target.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.errorIsNot}.
 */
export function errorIsNot(
  seat: Seat,
  err: unknown,
  target: unknown,
  msg: string,
): void {
  seat.helper();
  errors.errorIsNot(seat, MODE, err, target, msg);
}

/**
 * Record a failure when no error of the given class is in the chain.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.errorAs}.
 *
 * @returns The matching error, or undefined when nothing matched.
 */
export function errorAs<E>(
  seat: Seat,
  err: unknown,
  want: ErrorClass<E>,
  msg: string,
): E | undefined {
  seat.helper();
  return errors.errorAs(seat, MODE, err, want, msg);
}

/**
 * Record a failure when fn does not throw.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.throws}.
 *
 * @returns What fn threw, or undefined when it returned.
 */
export function throws(seat: Seat, fn: () => unknown, msg: string): unknown {
  seat.helper();
  return raising.throws(seat, MODE, fn, msg);
}

/**
 * Record a failure when fn throws.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.doesNotThrow}.
 */
export function doesNotThrow(seat: Seat, fn: () => unknown, msg: string): void {
  seat.helper();
  raising.doesNotThrow(seat, MODE, fn, msg);
}

/**
 * Record a failure when awaiting fn does not reject.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.rejectsWith}.
 *
 * @returns What the promise rejected with, or undefined.
 */
export function rejectsWith(
  seat: Seat,
  fn: () => Promise<unknown>,
  msg: string,
): Promise<unknown> {
  seat.helper();
  return track(seat, msg, raising.rejectsWith(seat, MODE, fn, msg));
}

/**
 * Record a failure when an aborted subject does not reject.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.honoursCancellation}.
 */
export function honoursCancellation(
  seat: Seat,
  fn: Cancellable,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, behaviour.honoursCancellation(seat, MODE, fn, msg));
}

/**
 * Record a failure when a subject past its deadline does not reject.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.honoursDeadline}.
 */
export function honoursDeadline(
  seat: Seat,
  fn: Cancellable,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, behaviour.honoursDeadline(seat, MODE, fn, msg));
}

/**
 * Record a failure when fn takes longer than within milliseconds.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.completesWithin}.
 */
export function completesWithin(
  seat: Seat,
  within: number,
  fn: (signal: AbortSignal) => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, behaviour.completesWithin(seat, MODE, within, fn, msg));
}

/**
 * Record a failure when a subject given no handle crashes.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.nullHandleSafe}.
 */
export function nullHandleSafe(
  seat: Seat,
  fn: (signal: AbortSignal | undefined) => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, behaviour.nullHandleSafe(seat, MODE, fn, msg));
}

/**
 * Record a failure when fn changes what observe reads.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isPure}.
 */
export function isPure(
  seat: Seat,
  observe: () => unknown,
  fn: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(seat, msg, behaviour.isPure(seat, MODE, observe, fn, msg, ...options));
}

/**
 * Record a failure when a body never passes in time.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.eventually}.
 */
export function eventually(
  seat: Seat,
  timeout: number,
  interval: number,
  body: (trial: Seat) => void | Promise<void>,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, waiting.eventually(seat, MODE, timeout, interval, body, msg));
}

/**
 * Record a failure when a predicate never becomes true in time.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.eventuallyTrue}.
 */
export function eventuallyTrue(
  seat: Seat,
  timeout: number,
  predicate: () => boolean | Promise<boolean>,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, waiting.eventuallyTrue(seat, MODE, timeout, predicate, msg));
}

/**
 * Answer a callable that records a failure when work outlives the scope.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.noTaskLeaks}.
 *
 * @returns A callable to invoke where the scope ends.
 */
export function noTaskLeaks(seat: Seat, msg: string): () => void {
  seat.helper();
  return waiting.noTaskLeaks(seat, MODE, msg);
}

/**
 * Record a failure when a second call leaves the state other than one
 * call left it.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isIdempotent}.
 */
export function isIdempotent<I>(
  seat: Seat,
  call: (input: I) => unknown,
  input: I,
  observe: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.isIdempotent(seat, MODE, call, input, observe, msg, ...options),
  );
}

/**
 * Record a failure when a call leaves a count unchanged, or two calls
 * change it by different amounts.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.accumulates}.
 */
export function accumulates<I>(
  seat: Seat,
  call: (input: I) => unknown,
  input: I,
  observe: () => Count | Promise<Count>,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, relation.accumulates(seat, MODE, call, input, observe, msg));
}

/**
 * Record a failure when one of 32 calls with one input returns another
 * result.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isDeterministic}.
 */
export function isDeterministic<I>(
  seat: Seat,
  call: (input: I) => unknown,
  input: I,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.isDeterministic(seat, MODE, call, input, msg, ...options),
  );
}

/**
 * Record a failure when combine(a, b) differs from combine(b, a).
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isCommutative}.
 */
export function isCommutative<T>(
  seat: Seat,
  combine: (a: T, b: T) => unknown,
  a: T,
  b: T,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.isCommutative(seat, MODE, combine, a, b, msg, ...options),
  );
}

/**
 * Record a failure when the two groupings of three operands differ.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isAssociative}.
 */
export function isAssociative<T>(
  seat: Seat,
  combine: (a: T, b: T) => T | Promise<T>,
  a: T,
  b: T,
  c: T,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.isAssociative(seat, MODE, combine, a, b, c, msg, ...options),
  );
}

/**
 * Record a failure when inverse(forward(input)) differs from input.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.roundTrip}.
 */
export function roundTrip<I, E>(
  seat: Seat,
  forward: (input: I) => E | Promise<E>,
  inverse: (encoded: E) => I | Promise<I>,
  input: I,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.roundTrip(seat, MODE, forward, inverse, input, msg, ...options),
  );
}

/**
 * Record a failure when one of 32 iterations yields another sequence.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.hasStableOrder}.
 */
export function hasStableOrder<T>(
  seat: Seat,
  iterate: () => Sequence<T> | Promise<Sequence<T>>,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.hasStableOrder(seat, MODE, iterate, msg, ...options),
  );
}

/**
 * Record a failure when one iteration yields an element equal to an
 * earlier one.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.noDuplicates}.
 */
export function noDuplicates<T>(
  seat: Seat,
  iterate: () => Sequence<T> | Promise<Sequence<T>>,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(seat, msg, relation.noDuplicates(seat, MODE, iterate, msg, ...options));
}

/**
 * Record a failure when a reading falls below the reading before it, or
 * is NaN.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isMonotonic}.
 */
export function isMonotonic(
  seat: Seat,
  observe: () => number | Promise<number>,
  advance: () => unknown,
  steps: number,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.isMonotonic(seat, MODE, observe, advance, steps, msg),
  );
}

/**
 * Record a failure at the first element of a domain for which call
 * throws or rejects.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isTotal}.
 */
export function isTotal<I>(
  seat: Seat,
  call: (input: I) => unknown,
  domain: Iterable<I>,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, relation.isTotal(seat, MODE, call, domain, msg));
}

/**
 * Record a failure when fn leaves what observe reads unchanged.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isNotPure}.
 */
export function isNotPure(
  seat: Seat,
  observe: () => unknown,
  fn: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return track(seat, msg, relation.isNotPure(seat, MODE, observe, fn, msg, ...options));
}

/**
 * Record a failure when a call after close does not fail with a sentinel.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.failsAfterClose}.
 */
export function failsAfterClose(
  seat: Seat,
  close: () => unknown,
  call: () => unknown,
  sentinel: unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(
    seat,
    msg,
    relation.failsAfterClose(seat, MODE, close, call, sentinel, msg),
  );
}

/**
 * Record a failure when one of 32 readings after an induced failure
 * succeeds.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isPoisoned}.
 */
export function isPoisoned(
  seat: Seat,
  induce: () => unknown,
  observe: () => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, relation.isPoisoned(seat, MODE, induce, observe, msg));
}

/**
 * Record a failure when got does not contain the elements of want, each
 * as often.
 *
 * The test carries on either way, and everything recorded is
 * reported when the test body ends. The signature and the
 * comparison rules are those of {@link check.isPermutation}.
 */
export function isPermutation<T>(
  seat: Seat,
  got: readonly T[],
  want: readonly NoInfer<T>[],
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  relation.isPermutation(seat, MODE, got, want, msg, ...options);
}
