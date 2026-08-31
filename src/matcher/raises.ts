/**
 * The assertions about a call that throws.
 *
 * Both take a callable rather than a value, because the throw has to
 * happen inside the assertion for it to be caught. A callable that
 * answers a promise is awaited, so the same assertion serves
 * synchronous and asynchronous code.
 */

import { type Mode, reportFailure, type Seat } from "./seat.js";

/** Whether a value is a promise this can await. */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Fail when fn does not throw.
 *
 * @returns What fn threw, or undefined when it returned.
 */
export function throws(
  seat: Seat,
  mode: Mode,
  fn: () => unknown,
  msg: string,
): unknown {
  seat.helper();
  try {
    const answered = fn();
    if (isPromise(answered)) {
      reportFailure(seat, mode, "throws", msg);
      return undefined;
    }
  } catch (thrown) {
    return thrown;
  }
  reportFailure(seat, mode, "throws", msg);
  return undefined;
}

/** Fail when fn throws. */
export function doesNotThrow(
  seat: Seat,
  mode: Mode,
  fn: () => unknown,
  msg: string,
): void {
  seat.helper();
  try {
    fn();
  } catch (thrown) {
    reportFailure(seat, mode, "not-throws", msg, { got: thrown });
  }
}

/**
 * Fail when awaiting fn does not reject.
 *
 * @returns What the promise rejected with, or undefined when it settled.
 */
export async function rejectsWith(
  seat: Seat,
  mode: Mode,
  fn: () => Promise<unknown>,
  msg: string,
): Promise<unknown> {
  seat.helper();
  try {
    await fn();
  } catch (thrown) {
    return thrown;
  }
  reportFailure(seat, mode, "throws", msg);
  return undefined;
}
