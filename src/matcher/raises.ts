/**
 * The assertions about a call that throws.
 *
 * Both take a callable rather than a value, because the throw has to
 * happen inside the assertion for it to be caught.
 */

import { callSite } from "../failure.js";
import type { Mode, Seat } from "./seat.js";
import { fail, pass, Running } from "./verdict.js";

/** Whether a value is a promise this can await. */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Fail when fn does not throw. A callable that answers a promise fails
 * too: a rejection is no throw, and passing it would make this assertion
 * lie.
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
  let answered: unknown;
  try {
    answered = fn();
  } catch (thrown) {
    pass(seat, mode, "throws", msg);
    return thrown;
  }
  if (isPromise(answered)) answered.catch(() => undefined);
  fail(seat, mode, "throws", msg);
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
    fail(seat, mode, "not-throws", msg, { got: thrown });
    return;
  }
  pass(seat, mode, "not-throws", msg);
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
  const run = Running.of(seat, callSite());
  try {
    await fn();
  } catch (thrown) {
    run.pass(mode, "throws", msg);
    return thrown;
  }
  run.fail(mode, "throws", msg, {});
  return undefined;
}
