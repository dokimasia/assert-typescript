/**
 * Assertions that stop the test at the first failure.
 *
 * Every assertion takes a seat first and a message last. The message
 * states the contract under test and is the first line of the failure,
 * so a failure says what was supposed to be true rather than only what
 * was observed.
 *
 * ```ts
 * import { check } from "@dokimi/assert";
 *
 * test("get", ({ seat }) => {
 *   check.equal(seat, store.get(id), item, "get answers the stored item");
 * });
 * ```
 *
 * The `soft` module carries the same assertions under the same names
 * and runs the same comparison. Only what happens on failure differs.
 */

import type { Cancellable } from "./matcher/behaviour.js";
import * as behaviour from "./matcher/behaviour.js";
import type { ErrorClass } from "./matcher/errors.js";
import * as errors from "./matcher/errors.js";
import type { Option } from "./matcher/option.js";
import * as order from "./matcher/order.js";
import { track } from "./matcher/pending.js";
import * as raising from "./matcher/raises.js";
import { Mode, type Seat } from "./matcher/seat.js";
import * as value from "./matcher/value.js";
import * as waiting from "./matcher/waiting.js";

export { rejects } from "./rejects.js";

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
 * check.equal(seat, store.get(id), item, "get answers the stored item");
 */
export function equal(
  seat: Seat,
  got: unknown,
  want: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  value.equal(seat, MODE, got, want, msg, ...options);
}

/**
 * Fail when got and want are equal.
 *
 * Comparison follows the rules of {@link equal}. The failure shows the
 * value the two shared, since printing one says everything.
 *
 * @param seat Where the failure is reported.
 * @param got The value produced by the code under test.
 * @param want The value it must not equal.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.notEqual(seat, token, previous, "refresh issues a new token");
 */
export function notEqual(
  seat: Seat,
  got: unknown,
  want: unknown,
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
export function length(seat: Seat, got: unknown, want: number, msg: string): void {
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
 * element compared by the rules of {@link equal}.
 *
 * @param seat Where the failure is reported.
 * @param haystack The container or text to search.
 * @param needle The element, key or substring to find.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.contains(seat, reply.headers, "etag", "the reply is cacheable");
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
 * Fail when haystack holds needle.
 *
 * Containment follows the rules of {@link contains}.
 *
 * @param seat Where the failure is reported.
 * @param haystack The container or text to search.
 * @param needle What must be absent.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.notContains(seat, body, "password", "no secret leaks");
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
  value.containsInOrder(seat, MODE, got, needles, msg);
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
  value.hasPrefix(seat, MODE, got, prefix, msg);
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
  value.hasSuffix(seat, MODE, got, suffix, msg);
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
 * check.matches(seat, id, "^req_[0-9a-f]{16}$", "the id is well formed");
 */
export function matches(seat: Seat, got: unknown, pattern: string, msg: string): void {
  seat.helper();
  value.matches(seat, MODE, got, pattern, msg);
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
 * check.closeTo(seat, elapsed, 1000, 50, "it waited about a second");
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

/**
 * Fail when an error is present.
 *
 * For code that hands an error back rather than throwing it. Where the
 * code throws, use {@link throws} or {@link doesNotThrow}.
 *
 * @param seat Where the failure is reported.
 * @param err The error value, or null when there was none.
 * @param msg The contract under test.
 * @example
 * check.noError(seat, result.error, "the write succeeds");
 */
export function noError(seat: Seat, err: unknown, msg: string): void {
  seat.helper();
  errors.noError(seat, MODE, err, msg);
}

/**
 * Fail when no error is present.
 *
 * @param seat Where the failure is reported.
 * @param err The error value, or null when there was none.
 * @param msg The contract under test.
 * @example
 * check.hasError(seat, result.error, "an unwritable path is refused");
 */
export function hasError(seat: Seat, err: unknown, msg: string): void {
  seat.helper();
  errors.hasError(seat, MODE, err, msg);
}

/**
 * Fail when err does not match target.
 *
 * Matching follows the chain of `cause`, so a wrapped error still
 * matches. target may be an error instance or an error class.
 *
 * @param seat Where the failure is reported.
 * @param err The error to inspect.
 * @param target The sentinel error or class it must match.
 * @param msg The contract under test.
 * @example
 * check.errorIs(seat, err, StoreClosed, "a closed store says so");
 */
export function errorIs(seat: Seat, err: unknown, target: unknown, msg: string): void {
  seat.helper();
  errors.errorIs(seat, MODE, err, target, msg);
}

/**
 * Fail when err matches target.
 *
 * Matching follows the chain of `cause`, as {@link errorIs} describes.
 *
 * @param seat Where the failure is reported.
 * @param err The error to inspect.
 * @param target The sentinel error or class it must not match.
 * @param msg The contract under test.
 * @example
 * check.errorIsNot(seat, err, Timeout, "a refusal is not a timeout");
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
 * Fail when no error of the given class is in the chain.
 *
 * @param seat Where the failure is reported.
 * @param err The error to inspect.
 * @param want The error class to look for.
 * @param msg The contract under test.
 * @returns The matching error, so its fields can be read, or undefined.
 * @example
 * const clash = check.errorAs(seat, err, Conflict, "a duplicate conflicts");
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
 * Fail when fn does not throw.
 *
 * fn must be synchronous. A callable answering a promise is reported
 * rather than silently passing, because an unawaited rejection is not
 * a throw and would make this assertion lie.
 *
 * @param seat Where the failure is reported.
 * @param fn Called with no arguments.
 * @param msg The contract under test.
 * @returns What fn threw, or undefined when it returned.
 * @example
 * const err = check.throws(seat, () => parse("{"), "a cut body is refused");
 */
export function throws(seat: Seat, fn: () => unknown, msg: string): unknown {
  seat.helper();
  return raising.throws(seat, MODE, fn, msg);
}

/**
 * Fail when fn throws.
 *
 * @param seat Where the failure is reported.
 * @param fn Called with no arguments.
 * @param msg The contract under test.
 * @example
 * check.doesNotThrow(seat, () => parse(body), "a valid body parses");
 */
export function doesNotThrow(seat: Seat, fn: () => unknown, msg: string): void {
  seat.helper();
  raising.doesNotThrow(seat, MODE, fn, msg);
}

/**
 * Fail when awaiting fn does not reject.
 *
 * The asynchronous counterpart of {@link throws}.
 *
 * @param seat Where the failure is reported.
 * @param fn Called with no arguments; its promise is awaited.
 * @param msg The contract under test.
 * @returns What the promise rejected with, or undefined.
 * @example
 * const err = await check.rejectsWith(seat, () => client.fetch(url), "it refuses");
 */
export function rejectsWith(
  seat: Seat,
  fn: () => Promise<unknown>,
  msg: string,
): Promise<unknown> {
  seat.helper();
  return raising.rejectsWith(seat, MODE, fn, msg);
}

/**
 * Fail when a subject given an aborted signal does not reject.
 *
 * The signal is aborted before the subject starts, so this asks
 * whether it checks at all rather than how quickly it notices.
 *
 * @param seat Where the failure is reported.
 * @param fn Takes an AbortSignal and answers a promise.
 * @param msg The contract under test.
 * @example
 * await check.honoursCancellation(seat, worker.serve, "it stops when told");
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
 * Fail when a subject given an expired deadline does not reject.
 *
 * Uses `AbortSignal.timeout`, so a subject that tells a timeout apart
 * from a cancellation still passes.
 *
 * @param seat Where the failure is reported.
 * @param fn Takes an AbortSignal and answers a promise.
 * @param msg The contract under test.
 * @example
 * await check.honoursDeadline(seat, client.fetch, "the fetch has a deadline");
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
 * Fail when fn takes longer than within milliseconds.
 *
 * fn is measured, not interrupted: a slow subject runs to completion
 * and then fails. This spends real time, up to however long fn takes.
 *
 * @param seat Where the failure is reported.
 * @param within The ceiling, in milliseconds.
 * @param fn Called with no arguments; awaited if it answers a promise.
 * @param msg The contract under test.
 * @example
 * await check.completesWithin(seat, 500, index.rebuild, "rebuilds stay quick");
 */
export function completesWithin(
  seat: Seat,
  within: number,
  fn: () => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  return track(seat, msg, behaviour.completesWithin(seat, MODE, within, fn, msg));
}

/**
 * Fail when a subject given no cancellation handle crashes.
 *
 * Rejecting with an error of its own is fine. What fails here is
 * dereferencing the missing signal, which is what a caller does by
 * accident and a middlebox by omission.
 *
 * @param seat Where the failure is reported.
 * @param fn Called with undefined in place of a signal.
 * @param msg The contract under test.
 * @example
 * await check.nullHandleSafe(seat, worker.attach, "no handle is not fatal");
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
 * Fail when fn changes what observe reads.
 *
 * observe is read before and after fn, and the two readings must be
 * equal by the rules of {@link equal}. What observe answers defines
 * what nothing means: whatever it leaves out, fn may change. Answer a
 * copy, because a projection sharing memory with the subject reads the
 * same object twice and passes whatever fn did.
 *
 * @param seat Where the failure is reported.
 * @param observe Called before and after fn; answers a projection.
 * @param fn The call that must change nothing observed.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.isPure(seat, store.snapshot, reader.peek, "peek changes nothing");
 */
export function isPure(
  seat: Seat,
  observe: () => unknown,
  fn: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  return behaviour.isPure(seat, MODE, observe, fn, msg, ...options);
}

/**
 * Fail when a body of assertions never passes in time.
 *
 * The body is handed a seat of its own, so assertions inside it record
 * an attempt rather than ending the test. It runs at least once
 * however short the timeout, and the failure carries the last
 * attempt's own reason rather than a bare timeout. This spends real
 * time.
 *
 * @param seat Where the failure is reported.
 * @param timeout How long to keep retrying, in milliseconds.
 * @param interval How long to wait between attempts, in milliseconds.
 * @param body Called with a seat; states the condition as assertions.
 * @param msg The contract under test.
 * @example
 * await check.eventually(seat, 5000, 100, settled, "the cache converges");
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
 * Fail when a predicate never becomes true in time.
 *
 * Retried with a backoff that doubles. A predicate carries no reason,
 * so the failure says only that the wait ran out; where the reason
 * matters, use {@link eventually}. This spends real time.
 *
 * @param seat Where the failure is reported.
 * @param timeout How long to keep retrying, in milliseconds.
 * @param predicate Called with no arguments; must eventually answer true.
 * @param msg The contract under test.
 * @example
 * await check.eventuallyTrue(seat, 5000, queue.drained, "the queue drains");
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
 * Answer a callable that fails when work outlives the scope.
 *
 * Reads Node's active resources, so a timer, socket or file handle
 * still open when the returned callable runs is a leak. A promise
 * nobody settles is not among them: Node keeps no list of pending
 * promises.
 *
 * @param seat Where the failure is reported.
 * @param msg The contract under test.
 * @returns A callable to invoke where the scope ends.
 * @example
 * const done = check.noTaskLeaks(seat, "the handler cleans up");
 * await handler.serve(request);
 * done();
 */
export function noTaskLeaks(seat: Seat, msg: string): () => void {
  seat.helper();
  return waiting.noTaskLeaks(seat, MODE, msg);
}
