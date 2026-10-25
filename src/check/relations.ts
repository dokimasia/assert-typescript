// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertions of `check` about the relation between the results of
 * several calls, such as idempotence, commutativity and a round trip, and
 * about the elements of two sequences. Each stops the test at the first
 * failure.
 */

import type { Option } from "../matcher/option.js";
import { track } from "../matcher/pending.js";
import * as refusal from "../matcher/refusal.js";
import type { Count } from "../matcher/relation.js";
import * as relation from "../matcher/relation.js";
import { Mode, type Seat } from "../matcher/seat.js";
import type { Sequence } from "../matcher/sequence.js";
import * as sequence from "../matcher/sequence.js";

/** Every failure on this surface stops the test. */
const MODE = Mode.Fatal;

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
    sequence.hasStableOrder(seat, MODE, iterate, msg, ...options),
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
  return track(seat, msg, sequence.noDuplicates(seat, MODE, iterate, msg, ...options));
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
  return track(seat, msg, refusal.isTotal(seat, MODE, call, domain, msg));
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
    refusal.failsAfterClose(seat, MODE, close, call, sentinel, msg),
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
  return track(seat, msg, refusal.isPoisoned(seat, MODE, induce, observe, msg));
}

/**
 * Fail when got does not contain the elements of want, each as often.
 *
 * The order does not count. Elements compare by the rules of
 * {@link isEqualTo}, and each element of want takes a partner of its own in
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
  sequence.isPermutation(seat, MODE, got, want, msg, ...options);
}
