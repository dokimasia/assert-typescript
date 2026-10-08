/**
 * The faults of this library.
 *
 * A fault is an error of the library: an input that a call cannot take, or
 * an error of the platform that ends a call. Its text states where in the
 * input the fault is, what is wrong, and the error that caused it, each
 * part after a colon.
 */

import { faultText } from "./verdict.js";

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
   * @param cause - The error that caused the fault, such as an error of the
   *   file system, or undefined for none.
   */
  constructor(at: string, reason: string, cause?: unknown) {
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
    return new Fault(at, this.reason, this.cause);
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
