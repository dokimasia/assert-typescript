// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertions of `soft` about errors and about what code does when it
 * runs: throws, rejections, cancellation, retries, leaked tasks and purity.
 * Each records a failure and lets the test continue.
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

/** Every failure on this surface is recorded, not thrown. */
const MODE = Mode.Soft;

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
 * comparison rules are those of {@link check.doesThrow}.
 *
 * @returns What fn threw, or undefined when it returned.
 */
export function doesThrow(seat: Seat, fn: () => unknown, msg: string): unknown {
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
