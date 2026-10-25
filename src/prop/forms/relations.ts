// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The property forms of the relations between the results of several calls,
 * and of a permutation. Each runs its assertion on every case of a run.
 */

import type { Count } from "../../matcher/relation.js";
import * as relation from "../../matcher/relation.js";
import { Mode, type Seat } from "../../matcher/seat.js";
import * as sequence from "../../matcher/sequence.js";
import { FORMS, runForm } from "../form.js";
import type { FormOption } from "../option.js";

/** Every form's assertion stops the case at its failure, as forAll's body does. */
const MODE = Mode.Fatal;

/**
 * Runs isPermutation on got(input) and want(input) for each generated
 * input. It is the form prop-permutation, and takes the relaxations of
 * permutation.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the elements that the code under test produces for the input.
 * @param want - Returns the elements that they must be an ordering of.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isPermutation(seat, (xs: number[]) => shuffle(xs), (xs) => xs,
 *   "a shuffle keeps every element", prop.using(prop.list(prop.integer(0, 9))));
 */
export function isPermutation<T, E>(
  seat: Seat,
  got: (input: T) => readonly E[],
  want: (input: T) => readonly E[],
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isPermutation, msg, options, (c, [input], relaxations) =>
    sequence.isPermutation(
      c,
      MODE,
      got(input as T),
      want(input as T),
      msg,
      ...relaxations,
    ),
  );
}

/**
 * Runs isIdempotent on call, the generated input and observe for each case.
 * It is the form prop-idempotent, and takes the relaxations of idempotent.
 *
 * @param seat - Where the failure is reported.
 * @param call - Called with the input, twice. It may return a promise.
 * @param observe - Returns a copy of the state after each call.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isIdempotent(seat, (id: number) => cart.remove(id), () => cart.items(),
 *   "a second remove changes nothing", prop.using(prop.integer(0, 9)));
 */
export function isIdempotent<I>(
  seat: Seat,
  call: (input: I) => unknown,
  observe: () => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isIdempotent, msg, options, (c, [input], relaxations) =>
    relation.isIdempotent(c, MODE, call, input as I, observe, msg, ...relaxations),
  );
}

/**
 * Runs accumulates on call, the generated input and observe for each case.
 * It is the form prop-accumulates.
 *
 * @param seat - Where the failure is reported.
 * @param call - Called with the input, twice. It may return a promise.
 * @param observe - Returns the count after each call.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.accumulates(seat, (n: number) => counter.add(n), () => counter.total,
 *   "each add counts", prop.using(prop.integer(1, 9)));
 */
export function accumulates<I>(
  seat: Seat,
  call: (input: I) => unknown,
  observe: () => Count | Promise<Count>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.accumulates, msg, options, (c, [input]) =>
    relation.accumulates(c, MODE, call, input as I, observe, msg),
  );
}

/**
 * Runs isDeterministic on call and the generated input for each case. It is
 * the form prop-deterministic, and takes the relaxations of deterministic.
 *
 * @param seat - Where the failure is reported.
 * @param call - Called with the input, twice. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isDeterministic(seat, (s: string) => render(s), "rendering is deterministic",
 *   prop.using(prop.string()));
 */
export function isDeterministic<I>(
  seat: Seat,
  call: (input: I) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isDeterministic, msg, options, (c, [input], relaxations) =>
    relation.isDeterministic(c, MODE, call, input as I, msg, ...relaxations),
  );
}

/**
 * Runs isCommutative on combine and the two inputs a and b that each case
 * generates. It is the form prop-commutative, and takes the relaxations of
 * commutative.
 *
 * @param seat - Where the failure is reported.
 * @param combine - Combines two inputs. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The inputs' generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isCommutative(seat, (a: Set<number>, b: Set<number>) => union(a, b),
 *   "union is commutative", prop.using(setOfDigits));
 */
export function isCommutative<T>(
  seat: Seat,
  combine: (a: T, b: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isCommutative, msg, options, (c, [a, b], relaxations) =>
    relation.isCommutative(c, MODE, combine, a as T, b as T, msg, ...relaxations),
  );
}

/**
 * Runs isAssociative on combine and the three inputs a, b and c that each
 * case generates. It is the form prop-associative, and takes the
 * relaxations of associative.
 *
 * @param seat - Where the failure is reported.
 * @param combine - Combines two inputs. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The inputs' generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isAssociative(seat, (a: bigint, b: bigint) => a + b, "addition is associative",
 *   prop.using(prop.integer(-10n, 10n)));
 */
export function isAssociative<T>(
  seat: Seat,
  combine: (a: T, b: T) => T | Promise<T>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isAssociative, msg, options, (c, [a, b, x], relaxations) =>
    relation.isAssociative(
      c,
      MODE,
      combine,
      a as T,
      b as T,
      x as T,
      msg,
      ...relaxations,
    ),
  );
}

/**
 * Runs roundTrip on forward, inverse and the generated input for each case.
 * It is the form prop-round-trip, and takes the relaxations of round-trip.
 *
 * @param seat - Where the failure is reported.
 * @param forward - Encodes the input. It may return a promise.
 * @param inverse - Decodes what forward returned. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.roundTrip(seat, (o: Order) => encode(o), (b) => decode(b),
 *   "an order survives its encoding", prop.using(prop.ofShape<Order>(orderShape)));
 */
export function roundTrip<I, E>(
  seat: Seat,
  forward: (input: I) => E | Promise<E>,
  inverse: (encoded: E) => I | Promise<I>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.roundTrip, msg, options, (c, [input], relaxations) =>
    relation.roundTrip(c, MODE, forward, inverse, input as I, msg, ...relaxations),
  );
}
