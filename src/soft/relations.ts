// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertions of `soft` about the relation between the results of
 * several calls, such as idempotence, commutativity and a round trip, and
 * about the elements of two sequences. Each records a failure and lets the
 * test continue.
 */

import type { Option } from "../matcher/option.js";
import { track } from "../matcher/pending.js";
import * as refusal from "../matcher/refusal.js";
import type { Count } from "../matcher/relation.js";
import * as relation from "../matcher/relation.js";
import { Mode, type Seat } from "../matcher/seat.js";
import type { Sequence } from "../matcher/sequence.js";
import * as sequence from "../matcher/sequence.js";

/** Every failure on this surface is recorded, not thrown. */
const MODE = Mode.Soft;

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
    sequence.hasStableOrder(seat, MODE, iterate, msg, ...options),
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
  return track(seat, msg, sequence.noDuplicates(seat, MODE, iterate, msg, ...options));
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
  return track(seat, msg, refusal.isTotal(seat, MODE, call, domain, msg));
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
    refusal.failsAfterClose(seat, MODE, close, call, sentinel, msg),
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
  return track(seat, msg, refusal.isPoisoned(seat, MODE, induce, observe, msg));
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
  sequence.isPermutation(seat, MODE, got, want, msg, ...options);
}
