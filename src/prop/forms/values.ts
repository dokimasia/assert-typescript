// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The property forms of the assertions about one value: equality, truth,
 * absence and size. Each runs its assertion on every case of a run.
 */

import { Mode, type Seat } from "../../matcher/seat.js";
import * as value from "../../matcher/value.js";
import { FORMS, runForm } from "../form.js";
import type { FormOption } from "../option.js";

/** Every form's assertion stops the case at its failure, as forAll's body does. */
const MODE = Mode.Fatal;

/**
 * Runs isEqualTo on got(input) and want(input) for each generated input. It
 * is the form prop-equal, and takes the relaxations of equal.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that the code under test produces for the input.
 * @param want - Returns the value that it is supposed to produce.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isEqualTo(seat, (xs: number[]) => sort(sort(xs)), (xs) => sort(xs),
 *   "sorting is idempotent", prop.using(prop.list(prop.integer(0, 9))));
 */
export function isEqualTo<T, U>(
  seat: Seat,
  got: (input: T) => U,
  want: (input: T) => U,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isEqualTo, msg, options, (c, [input], relaxations) =>
    value.equal(c, MODE, got(input as T), want(input as T), msg, ...relaxations),
  );
}

/**
 * Runs isNotEqualTo on got(input) and want(input) for each generated input.
 * It is the form prop-not-equal, and takes the relaxations of not-equal.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that the code under test produces for the input.
 * @param want - Returns the value that it must not equal.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNotEqualTo(seat, (s: string) => hash(s), (s) => hash(`${s}!`),
 *   "a suffix changes the hash", prop.using(prop.string()));
 */
export function isNotEqualTo<T, U>(
  seat: Seat,
  got: (input: T) => U,
  want: (input: T) => U,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNotEqualTo, msg, options, (c, [input], relaxations) =>
    value.notEqual(c, MODE, got(input as T), want(input as T), msg, ...relaxations),
  );
}

/**
 * Runs isTrue on condition(input) for each generated input. It is the form
 * prop-true.
 *
 * @param seat - Where the failure is reported.
 * @param condition - Returns the condition that must be true for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isTrue(seat, (n: number) => abs(n) >= 0, "abs is never negative",
 *   prop.using(prop.integer(-100, 100)));
 */
export function isTrue<T>(
  seat: Seat,
  condition: (input: T) => boolean,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isTrue, msg, options, (c, [input]) =>
    value.isTrue(c, MODE, condition(input as T), msg),
  );
}

/**
 * Runs isFalse on condition(input) for each generated input. It is the form
 * prop-false.
 *
 * @param seat - Where the failure is reported.
 * @param condition - Returns the condition that must be false for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isFalse(seat, (s: string) => s.includes("\n"), "a slug has no line break",
 *   prop.using(prop.stringMatching("[a-z]+")));
 */
export function isFalse<T>(
  seat: Seat,
  condition: (input: T) => boolean,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isFalse, msg, options, (c, [input]) =>
    value.isFalse(c, MODE, condition(input as T), msg),
  );
}

/**
 * Runs isNil on got(input) for each generated input. It is the form
 * prop-nil.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must be null or undefined for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNil(seat, (k: string) => empty.get(k), "an empty map has no entry",
 *   prop.using(prop.string()));
 */
export function isNil<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNil, msg, options, (c, [input]) =>
    value.isNil(c, MODE, got(input as T), msg),
  );
}

/**
 * Runs isNotNil on got(input) for each generated input. It is the form
 * prop-not-nil.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must be neither null nor undefined for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNotNil(seat, (id: number) => store.get(id), "every seeded id is stored",
 *   prop.using(prop.integer(1, 10)));
 */
export function isNotNil<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNotNil, msg, options, (c, [input]) =>
    value.isNotNil(c, MODE, got(input as T), msg),
  );
}

/**
 * Runs hasLength on got(input) and want for each generated input. It is the
 * form prop-length.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value whose length is checked for the input.
 * @param want - The length that it must have.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.hasLength(seat, (b: Uint8Array) => digest(b), 32, "a digest has 32 bytes",
 *   prop.using(prop.bytes()));
 */
export function hasLength<T>(
  seat: Seat,
  got: (input: T) => unknown,
  want: number,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.hasLength, msg, options, (c, [input]) =>
    value.length(c, MODE, got(input as T), want, msg),
  );
}

/**
 * Runs isEmpty on got(input) for each generated input. It is the form
 * prop-empty.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must be empty for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isEmpty(seat, (xs: number[]) => diff(xs, xs), "a list differs from itself in nothing",
 *   prop.using(prop.list(prop.integer(0, 9))));
 */
export function isEmpty<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isEmpty, msg, options, (c, [input]) =>
    value.isEmpty(c, MODE, got(input as T), msg),
  );
}

/**
 * Runs isNotEmpty on got(input) for each generated input. It is the form
 * prop-not-empty.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must not be empty for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNotEmpty(seat, (s: string) => slug(s), "a slug is never empty",
 *   prop.using(prop.string({ minSize: 1 })));
 */
export function isNotEmpty<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNotEmpty, msg, options, (c, [input]) =>
    value.isNotEmpty(c, MODE, got(input as T), msg),
  );
}
