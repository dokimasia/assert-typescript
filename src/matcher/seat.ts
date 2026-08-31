/**
 * The seam every assertion reports through.
 *
 * An assertion never calls a test runner and never throws on its own.
 * It reports to whatever seat it is handed, which is what lets one
 * assertion serve a real test, a benchmark and a test that checks the
 * assertion itself.
 */

import { type Clock, System } from "../clock.js";
import { callSite, type Failure, render } from "../failure.js";

/** Where an assertion reports, and what it may do about it. */
export interface Seat {
  /**
   * Mark this frame as the library's, not the caller's.
   *
   * Named for the same reason Go's `testing.TB.Helper` is: a runner
   * that can hide library frames from a stack trace does it here.
   */
  helper(): void;

  /** Report a failure that stops the test. */
  fail(message: string): void;

  /** Report a failure the test may carry on past. */
  record(message: string): void;
}

/**
 * Whether a failure stops the test or is recorded.
 *
 * A const object rather than an enum. Node strips types to run
 * TypeScript directly, and an enum is the one construct that cannot be
 * stripped, because it emits a runtime value that has no JavaScript
 * spelling.
 */
export const Mode = {
  /** Stop the test at this failure. */
  Fatal: "fatal",
  /** Record the failure and carry on. */
  Soft: "soft",
} as const;

/** One of the two failure modes. */
export type Mode = (typeof Mode)[keyof typeof Mode];

/**
 * Send one failure to the seat, under the given mode.
 *
 * This decides nothing about whether anything failed. A matcher calls
 * it only once its own comparison has failed, so every call produces
 * exactly one reported failure. Under {@link Mode.Fatal} it may not
 * return.
 *
 * @param seat Where the failure is reported.
 * @param mode Whether the failure stops the test or is recorded.
 * @param message The failure text, already formatted.
 */
export function report(seat: Seat, mode: Mode, message: string): void {
  seat.helper();
  if (mode === Mode.Soft) {
    seat.record(message);
    return;
  }
  seat.fail(message);
}

/** A seat that takes the record rather than the sentence. */
interface Reporter {
  report(failure: Failure, aborting: boolean): void;
}

/** Whether a seat can take a record. */
function takesRecords(seat: Seat): seat is Seat & Reporter {
  return typeof (seat as Partial<Reporter>).report === "function";
}

/**
 * Send one record to seat.
 *
 * A seat that takes records receives it; any other receives the
 * sentence rendered from it. The call site is read here, so a matcher
 * does not have to walk the stack.
 *
 * This does not decide whether anything failed. A matcher calls it
 * only once its own comparison has failed.
 *
 * @param seat - Where the failure is reported.
 * @param mode - Whether a failure throws or is recorded.
 * @param assertion - The canonical id the definition names.
 * @param contract - The caller's message, unchanged.
 * @param detail - The values this assertion declares.
 */
export function reportFailure(
  seat: Seat,
  mode: Mode,
  assertion: string,
  contract: string,
  detail: Record<string, unknown> = {},
): void {
  seat.helper();
  const where = callSite();
  const failure: Failure = where
    ? { assertion, contract, detail, where }
    : { assertion, contract, detail };

  if (takesRecords(seat)) {
    seat.report(failure, mode !== Mode.Soft);
    return;
  }
  report(seat, mode, render(failure));
}

/** A seat that carries a clock. */
interface Clocked {
  clock(): Clock;
}

/**
 * Answer the clock seat carries, or the platform clock.
 *
 * @param seat - Where the failure is reported, which is also where a
 *   test supplies time.
 * @returns What the seat carries, or System when it carries nothing.
 */
export function clockOf(seat: Seat): Clock {
  const held = (seat as Partial<Clocked>).clock;
  if (typeof held === "function") {
    const supplied = held.call(seat);
    if (supplied) return supplied;
  }
  return new System();
}
