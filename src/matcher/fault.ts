// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The faults of this library.
 *
 * A fault is an error of the library: an input that a call cannot take, or
 * an error of the platform that ends a call. Its text states where in the
 * input the fault is, what is wrong, and the error that caused it, each
 * part after a colon. A seat that takes faults receives a fault, and a
 * fault that ends a call is thrown for any other seat.
 */

import { type Seat, takesFaults } from "./seat.js";

/**
 * Returns a fault as an error.
 *
 * @param error - The fault.
 * @returns error itself when it is an Error, and otherwise an Error whose
 *   message is its text.
 */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(faultText(error));
}

/**
 * Returns the text of a fault.
 *
 * @param error - What ended the call.
 * @returns The message of an error, and the text of any other value.
 */
export function faultText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ends a call that reports no verdict with a fault. A seat that takes
 * faults receives it with ending true, and the fault is thrown for any
 * other seat. It writes no call record. It may not return.
 *
 * @param seat - The seat of the call.
 * @param error - The fault.
 * @throws The fault, as an Error, for a seat that does not take faults.
 */
export function end(seat: Seat, error: unknown): void {
  seat.helper();
  const reported = asError(error);
  if (!takesFaults(seat)) {
    throw reported;
  }
  seat.reportFault(reported, true);
}

/**
 * Notes a fault that does not end the call, such as a file of a property's
 * store that the run skips. A seat that takes faults receives it with
 * ending false. For any other seat, the message of the fault goes to
 * console.warn, which the test runner shows beside the test.
 *
 * @param seat - The seat of the call.
 * @param error - The fault.
 */
export function noteFault(seat: Seat, error: unknown): void {
  const noted = asError(error);
  if (!takesFaults(seat)) {
    console.warn(noted.message);
    return;
  }
  seat.reportFault(noted, false);
}

/** An error of this library, at a part of an input or at the whole of it. */
export class Fault extends Error {
  /**
   * Where in the input the fault is: a selector such as `entries[2].mode`,
   * a path of a tree, or the empty string for the whole input.
   */
  readonly at: string;
  /** What is wrong, in one clause. */
  readonly reason: string;

  /**
   * Returns the fault at a part of an input.
   *
   * @param at - Where in the input the fault is, or the empty string.
   * @param reason - What is wrong, in one clause.
   * @param options - The error that caused the fault as cause, such as an
   *   error of the file system. A fault without options has no cause. The
   *   cause is required, so an error passed in place of the options does
   *   not compile.
   */
  constructor(at: string, reason: string, options?: { readonly cause: unknown }) {
    const cause = options?.cause;
    const parts = [at, reason, cause === undefined ? "" : faultText(cause)];
    super(parts.filter((part) => part !== "").join(": "), { cause });
    this.name = "Fault";
    this.at = at;
    this.reason = reason;
  }

  /**
   * Returns this fault as a fault of a larger input that contains this
   * input at outer, such as the member of a vector that states a tree.
   *
   * @param outer - The selector of this input within the larger one.
   * @returns The fault at the joined selector, with the same reason and
   *   the same cause.
   */
  within(outer: string): Fault {
    const at = [outer, this.at].filter((part) => part !== "").join(".");
    return new Fault(at, this.reason, { cause: this.cause });
  }
}

/**
 * Returns the fault of an operation that error ended, as a seat receives
 * it.
 *
 * @param op - The operation, the module and the function, such as
 *   `files.workspace`.
 * @param error - What ended it.
 * @returns An error whose message is the operation, then the text of error.
 */
export function ofOperation(op: string, error: unknown): Error {
  return new Error(`${op}: ${faultText(error)}`);
}
