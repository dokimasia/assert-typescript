// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The property forms of the assertions about errors and about what code does
 * when it runs: throws, purity and cancellation. Each runs its assertion on
 * every case of a run.
 */

import type { Cancellable } from "../../matcher/behaviour.js";
import * as behaviour from "../../matcher/behaviour.js";
import type { ErrorClass } from "../../matcher/errors.js";
import * as errors from "../../matcher/errors.js";
import * as raising from "../../matcher/raises.js";
import * as relation from "../../matcher/relation.js";
import { Mode, type Seat } from "../../matcher/seat.js";
import { FORMS, runForm } from "../form.js";
import type { FormOption } from "../option.js";

/** Every form's assertion stops the case at its failure, as forAll's body does. */
const MODE = Mode.Fatal;

/**
 * Runs noError on fn(input) for each generated input. It is the form
 * prop-err-absent.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input, or null when there is none.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.noError(seat, (s: string) => validate(s).error, "every slug validates",
 *   prop.using(prop.stringMatching("[a-z]+")));
 */
export function noError<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.noError, msg, options, (c, [input]) =>
    errors.noError(c, MODE, fn(input as T), msg),
  );
}

/**
 * Runs hasError on fn(input) for each generated input. It is the form
 * prop-err-present.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input, or null when there is none.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.hasError(seat, (s: string) => validate(` ${s}`).error, "a leading space is refused",
 *   prop.using(prop.string()));
 */
export function hasError<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.hasError, msg, options, (c, [input]) =>
    errors.hasError(c, MODE, fn(input as T), msg),
  );
}

/**
 * Runs errorIs on fn(input) and target for each generated input. It is the
 * form prop-err-is.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input.
 * @param target - The sentinel error or the class that it must match.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.errorIs(seat, (id: number) => closed.get(id).error, StoreClosed,
 *   "a closed store refuses every read", prop.using(prop.integer(0, 9)));
 */
export function errorIs<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  target: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.errorIs, msg, options, (c, [input]) =>
    errors.errorIs(c, MODE, fn(input as T), target, msg),
  );
}

/**
 * Runs errorIsNot on fn(input) and target for each generated input. It is
 * the form prop-err-is-not.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input.
 * @param target - The sentinel error or the class that it must not match.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.errorIsNot(seat, (s: string) => parse(s).error, Timeout,
 *   "parsing never times out", prop.using(prop.string()));
 */
export function errorIsNot<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  target: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.errorIsNot, msg, options, (c, [input]) =>
    errors.errorIsNot(c, MODE, fn(input as T), target, msg),
  );
}

/**
 * Runs errorAs on fn(input) and want for each generated input. It is the
 * form prop-err-as.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input.
 * @param want - The error class that must be in the error's chain.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.errorAs(seat, (id: number) => taken.add(id).error, Conflict,
 *   "a taken id conflicts", prop.using(prop.integer(0, 9)));
 */
export function errorAs<T, E>(
  seat: Seat,
  fn: (input: T) => unknown,
  want: ErrorClass<E>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.errorAs, msg, options, (c, [input]) => {
    errors.errorAs(c, MODE, fn(input as T), want, msg);
  });
}

/**
 * Runs doesThrow on a call of fn with the input for each generated input.
 * It is the form prop-throws.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with the input. It must be synchronous.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.doesThrow(seat, (s: string) => parse(`{${s}`), "an open brace is refused",
 *   prop.using(prop.string()));
 */
export function doesThrow<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.doesThrow, msg, options, (c, [input]) => {
    raising.throws(c, MODE, () => fn(input as T), msg);
  });
}

/**
 * Runs doesNotThrow on a call of fn with the input for each generated
 * input. It is the form prop-not-throws.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.doesNotThrow(seat, (b: Uint8Array) => decode(b), "decode never throws",
 *   prop.using(prop.bytes()));
 */
export function doesNotThrow<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.doesNotThrow, msg, options, (c, [input]) =>
    raising.doesNotThrow(c, MODE, () => fn(input as T), msg),
  );
}

/**
 * Runs isPure on observe and a call of fn with the input for each generated
 * input. It is the form prop-pure, and takes the relaxations of pure.
 *
 * @param seat - Where the failure is reported.
 * @param observe - Returns a copy of the state that fn must not change.
 * @param fn - Called with the input. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isPure(seat, () => store.snapshot(), (id: number) => store.peek(id),
 *   "peek changes nothing", prop.using(prop.integer(0, 9)));
 */
export function isPure<T>(
  seat: Seat,
  observe: () => unknown,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isPure, msg, options, (c, [input], relaxations) =>
    behaviour.isPure(c, MODE, observe, () => fn(input as T), msg, ...relaxations),
  );
}

/**
 * Runs isNotPure on observe and a call of fn with the input for each
 * generated input. It is the form prop-not-pure, and takes the relaxations
 * of not-pure.
 *
 * @param seat - Where the failure is reported.
 * @param observe - Returns a copy of the state that fn must change.
 * @param fn - Called with the input. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNotPure(seat, () => log.length, (line: string) => log.push(line),
 *   "every write grows the log", prop.using(prop.string()));
 */
export function isNotPure<T>(
  seat: Seat,
  observe: () => unknown,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNotPure, msg, options, (c, [input], relaxations) =>
    relation.isNotPure(c, MODE, observe, () => fn(input as T), msg, ...relaxations),
  );
}

/**
 * Runs nullHandleSafe on fn with the input for each generated input. It is
 * the form prop-nil-context-safe.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with undefined in place of a signal, and with the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.nullHandleSafe(seat, (signal, url: string) => client.fetch(url, { signal }),
 *   "a fetch needs no signal", prop.using(prop.string()));
 */
export function nullHandleSafe<T>(
  seat: Seat,
  fn: (signal: AbortSignal | undefined, input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.nullHandleSafe, msg, options, (c, [input]) =>
    behaviour.nullHandleSafe(c, MODE, (signal) => fn(signal, input as T), msg),
  );
}

/**
 * Runs honoursCancellation on fn with the input for each generated input.
 * It is the form prop-honours-cancellation.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with an aborted signal and the input. It returns a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.honoursCancellation(seat, (signal, job: Job) => worker.run(job, signal),
 *   "every job stops when told", prop.using(prop.of<Job>("Job")));
 */
export function honoursCancellation<T>(
  seat: Seat,
  fn: (signal: AbortSignal, input: T) => Promise<unknown>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.honoursCancellation, msg, options, (c, [input]) => {
    const call: Cancellable = (signal) => fn(signal, input as T);
    return behaviour.honoursCancellation(c, MODE, call, msg);
  });
}

/**
 * Runs honoursDeadline on fn with the input for each generated input. It is
 * the form prop-honours-deadline.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with an expired signal and the input. It returns a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.honoursDeadline(seat, (signal, url: string) => client.fetch(url, { signal }),
 *   "every fetch has a deadline", prop.using(prop.string()));
 */
export function honoursDeadline<T>(
  seat: Seat,
  fn: (signal: AbortSignal, input: T) => Promise<unknown>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.honoursDeadline, msg, options, (c, [input]) => {
    const call: Cancellable = (signal) => fn(signal, input as T);
    return behaviour.honoursDeadline(c, MODE, call, msg);
  });
}
