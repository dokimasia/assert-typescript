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
import type { Count, Sequence } from "./matcher/relation.js";
import * as relation from "./matcher/relation.js";
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
  return track(seat, msg, raising.rejectsWith(seat, MODE, fn, msg));
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
 * Fail when fn has not settled within milliseconds.
 *
 * fn receives a signal that aborts when the duration has passed, so a
 * subject that watches it can stop in time. A subject that has not
 * settled by then fails at that moment, and the assertion does not wait
 * for it. A subject that settles is measured on the seat's clock, and a
 * rejection settles it. This spends real time, up to within.
 *
 * @param seat Where the failure is reported.
 * @param within The ceiling, in milliseconds.
 * @param fn Called with the signal; awaited if it answers a promise.
 * @param msg The contract under test.
 * @example
 * await check.completesWithin(seat, 500, index.rebuild, "rebuilds stay quick");
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
  return track(seat, msg, behaviour.isPure(seat, MODE, observe, fn, msg, ...options));
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

/**
 * Fail when a second call leaves the state other than one call left it.
 *
 * call runs twice with input, and observe reads the state after each call.
 * first is the reading after one call, and second the reading after two.
 * A throw or a rejection of call or observe fails in the field of the
 * reading that it ended, with the other null. Return a copy from observe,
 * as {@link isPure} requires.
 *
 * @param seat Where the failure is reported.
 * @param call The operation a caller may repeat; awaited if it returns a promise.
 * @param input What each call is given.
 * @param observe Called after each call; returns a projection of the state.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.isIdempotent(seat, store.put, item, () => [...store.list()],
 *   "a repeated put leaves the store as one put left it");
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
 * Fail when a call leaves a count unchanged, or two calls change it by
 * different amounts.
 *
 * observe reads the count before the first call and after each of two
 * calls of call with input. first and second are the two changes. A count
 * is a number or a bigint. A throw or a rejection fails in the field of the
 * change that it ended, with the other null.
 *
 * @param seat Where the failure is reported.
 * @param call The operation that adds to the count.
 * @param input What each call is given.
 * @param observe Returns the count.
 * @param msg The contract under test.
 * @example
 * await check.accumulates(seat, log.append, event, () => log.size,
 *   "each append adds one entry");
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
 * Fail when one of 32 calls with one input returns another result.
 *
 * first is the first result, and second the first result that differs. A
 * throw or a rejection fails in first on the first call and in second on a
 * later one, with the other null.
 *
 * @param seat Where the failure is reported.
 * @param call The computation; awaited if it returns a promise.
 * @param input What each call is given.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.isDeterministic(seat, encode, value, "encode returns the same bytes");
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
 * Fail when combine(a, b) differs from combine(b, a).
 *
 * first is combine(a, b), and second combine(b, a). A throw or a rejection
 * fails in the field of the order that it ended, with the other null.
 *
 * @param seat Where the failure is reported.
 * @param combine The operation whose operands may swap.
 * @param a The first operand.
 * @param b The second operand.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.isCommutative(seat, merge, left, right, "merge ignores the order");
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
 * Fail when combine(combine(a, b), c) differs from combine(a, combine(b, c)).
 *
 * first is the left grouping, and second the right one. A throw or a
 * rejection fails in the field of the grouping that it ended, with the
 * other null.
 *
 * @param seat Where the failure is reported.
 * @param combine The operation whose groupings may change.
 * @param a The first operand.
 * @param b The second operand.
 * @param c The third operand.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.isAssociative(seat, concat, x, y, z, "concat groups either way");
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
 * Fail when inverse(forward(input)) differs from input.
 *
 * want is input, and got what came back. A throw or a rejection of forward
 * or inverse fails with want null and got what it threw.
 *
 * @param seat Where the failure is reported.
 * @param forward The conversion, such as an encoder.
 * @param inverse The conversion back, such as the decoder.
 * @param input What forward is given.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.roundTrip(seat, encode, decode, value, "decode undoes encode");
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
 * Fail when one of 32 iterations yields another sequence.
 *
 * iterate returns an iterable, an async iterable, or a promise of either.
 * first is the first sequence, and second the first sequence that differs.
 * A throw or a rejection fails as {@link isDeterministic} states for its
 * call.
 *
 * @param seat Where the failure is reported.
 * @param iterate Returns one iteration of the subject.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.hasStableOrder(seat, () => registry.names(), "names keep one order");
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
 * Fail when one iteration yields an element equal to an earlier one.
 *
 * iterate returns an iterable, an async iterable, or a promise of either.
 * got is the repeated element, and index its position. Each element is
 * compared with every earlier one, which is n(n-1)/2 comparisons for n
 * elements. A throw or a rejection fails with got what it threw and index
 * null.
 *
 * @param seat Where the failure is reported.
 * @param iterate Returns one iteration of the subject.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.noDuplicates(seat, () => store.list(), "list returns each item once");
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
 * Fail when a reading falls below the reading before it, or is NaN.
 *
 * observe reads once, then advance and observe run steps times. index is
 * the position of the reading that fell, the first reading at position 0.
 * first is the reading before it, null at position 0, and second that
 * reading. A throw or a rejection fails with index and first null and
 * second what it threw.
 *
 * @param seat Where the failure is reported.
 * @param observe Returns the reading.
 * @param advance Moves the subject one step.
 * @param steps How many times advance runs.
 * @param msg The contract under test.
 * @example
 * await check.isMonotonic(seat, () => clock.now(), () => clock.tick(), 100,
 *   "the clock never runs backwards");
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
 * Fail at the first element of a domain for which call throws or rejects.
 *
 * The elements are called in order. index is the element's position, and
 * got what call threw. An empty domain passes.
 *
 * @param seat Where the failure is reported.
 * @param call The operation that must accept every element.
 * @param domain The elements, in order.
 * @param msg The contract under test.
 * @example
 * await check.isTotal(seat, describe, knownCodes, "describe accepts every known code");
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
 * Fail when fn leaves what observe reads unchanged.
 *
 * The negation of {@link isPure}, with the same arguments. got is the
 * reading that did not change, or what observe or fn threw.
 *
 * @param seat Where the failure is reported.
 * @param observe Called before and after fn; returns a projection.
 * @param fn The call that must change something observed.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * await check.isNotPure(seat, () => cache.size, () => cache.warm(), "warm fills the cache");
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
 * Fail when a call after close does not fail with a sentinel.
 *
 * close runs, then call. call must throw or reject with an error that
 * matches sentinel as {@link errorIs} matches one, through the chain of
 * causes. want is sentinel, and got what call threw, or null when it
 * returned. A throw or a rejection of close fails with want null and got
 * what it threw.
 *
 * @param seat Where the failure is reported.
 * @param close Closes the subject.
 * @param call A call that the closed subject must refuse.
 * @param sentinel The error or the class of error that call fails with.
 * @param msg The contract under test.
 * @example
 * await check.failsAfterClose(seat, () => file.close(), () => file.read(),
 *   ClosedError, "a closed file refuses a read");
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
 * Fail when one of 32 readings after an induced failure succeeds.
 *
 * induce runs, then observe 32 times, and each reading must throw or
 * reject. index is the position of the first reading that returned, and
 * got what it returned. A throw or a rejection of induce fails with index
 * null and got what it threw.
 *
 * @param seat Where the failure is reported.
 * @param induce Induces the failure.
 * @param observe Reads the subject once.
 * @param msg The contract under test.
 * @example
 * await check.isPoisoned(seat, () => disk.failWrites(), () => store.put(item),
 *   "a store that lost its disk refuses every write");
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
 * Fail when got does not contain the elements of want, each as often.
 *
 * The order does not count. Elements compare by the rules of
 * {@link equal}, and each element of want takes a partner of its own in
 * got.
 *
 * @param seat Where the failure is reported.
 * @param got The sequence produced.
 * @param want The elements it must contain.
 * @param msg The contract under test.
 * @param options Relaxations for this call alone.
 * @example
 * check.isPermutation(seat, shuffled, deck, "a shuffle keeps every card");
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
