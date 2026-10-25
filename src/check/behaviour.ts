// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertions of `check` about errors and about what code does when it
 * runs: throws, rejections, cancellation, retries, leaked tasks and purity.
 * Each stops the test at the first failure.
 */

import type { Cancellable } from "../matcher/behaviour.js";
import * as behaviour from "../matcher/behaviour.js";
import type { ErrorClass } from "../matcher/errors.js";
import * as errors from "../matcher/errors.js";
import type { Option } from "../matcher/option.js";
import { track } from "../matcher/pending.js";
import * as raising from "../matcher/raises.js";
import * as relation from "../matcher/relation.js";
import { Mode, type Seat } from "../matcher/seat.js";
import * as waiting from "../matcher/waiting.js";

/** Every failure on this surface stops the test. */
const MODE = Mode.Fatal;

/**
 * Fail when an error is present.
 *
 * For code that hands an error back rather than throwing it. Where the
 * code throws, use {@link doesThrow} or {@link doesNotThrow}.
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
 * const err = check.doesThrow(seat, () => parse("{"), "a cut body is refused");
 */
export function doesThrow(seat: Seat, fn: () => unknown, msg: string): unknown {
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
 * The asynchronous counterpart of {@link doesThrow}.
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
 * equal by the rules of {@link isEqualTo}. What observe answers defines
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
