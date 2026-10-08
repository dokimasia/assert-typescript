/**
 * The assertions about an error value.
 *
 * For code that hands an error back rather than throwing it: a
 * settled promise's rejection reason, a Node callback's first
 * argument, a result object's error field. Where the code throws, use
 * the assertions in `raises.ts`.
 *
 * Matching follows the chain of causes, which is what `cause` on an
 * Error is for and what lets a wrapped failure still be recognised.
 */

import type { Mode, Seat } from "./seat.js";
import { fail, pass } from "./verdict.js";

/** How far down a cause chain to look before calling it cyclic. */
const MAX_CAUSES = 100;

/** Answer every error in the chain, starting with the error itself. */
function chain(error: unknown): unknown[] {
  const found: unknown[] = [];
  let current = error;
  for (let depth = 0; depth < MAX_CAUSES; depth += 1) {
    if (current === null || current === undefined) break;
    if (found.includes(current)) break;
    found.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return found;
}

/**
 * Reports whether target matches error, or an error that it wraps: the
 * same value, an instance of a target class, or an error of the same name
 * with the same message.
 */
export function matchesTarget(error: unknown, target: unknown): boolean {
  return chain(error).some((link) => {
    if (link === target) return true;
    if (typeof target === "function" && link instanceof (target as never)) return true;
    if (target instanceof Error && link instanceof Error) {
      return link.name === target.name && link.message === target.message;
    }
    return false;
  });
}

/** Fail when an error is present. */
export function noError(seat: Seat, mode: Mode, err: unknown, msg: string): void {
  seat.helper();
  if (err !== null && err !== undefined) {
    fail(seat, mode, "err-absent", msg, { got: err });
    return;
  }
  pass(seat, mode, "err-absent", msg);
}

/** Fail when no error is present. */
export function hasError(seat: Seat, mode: Mode, err: unknown, msg: string): void {
  seat.helper();
  if (err === null || err === undefined) {
    fail(seat, mode, "err-present", msg);
    return;
  }
  pass(seat, mode, "err-present", msg);
}

/** Fail when err does not match target, through the chain of causes. */
export function errorIs(
  seat: Seat,
  mode: Mode,
  err: unknown,
  target: unknown,
  msg: string,
): void {
  seat.helper();
  if (!matchesTarget(err, target)) {
    fail(seat, mode, "err-is", msg, { want: target, got: err });
    return;
  }
  pass(seat, mode, "err-is", msg);
}

/** Fail when err matches target. */
export function errorIsNot(
  seat: Seat,
  mode: Mode,
  err: unknown,
  target: unknown,
  msg: string,
): void {
  seat.helper();
  if (matchesTarget(err, target)) {
    fail(seat, mode, "err-is-not", msg, { got: err });
    return;
  }
  pass(seat, mode, "err-is-not", msg);
}

/** A class of error, as `errorAs` looks for one. */
export type ErrorClass<E> = abstract new (...args: never[]) => E;

/**
 * Fail when no error of the given class is in the chain.
 *
 * @returns The matching error, so its fields can be read, or undefined.
 */
export function errorAs<E>(
  seat: Seat,
  mode: Mode,
  err: unknown,
  want: ErrorClass<E>,
  msg: string,
): E | undefined {
  seat.helper();
  const found = chain(err).find((link) => link instanceof want);
  if (found === undefined) {
    fail(seat, mode, "err-as", msg, { want, got: err });
    return undefined;
  }
  pass(seat, mode, "err-as", msg);
  return found as E;
}
