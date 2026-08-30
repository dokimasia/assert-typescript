/**
 * The seam every assertion reports through.
 *
 * An assertion never calls a test runner and never throws on its own.
 * It reports to whatever seat it is handed, which is what lets one
 * assertion serve a real test, a benchmark and a test that checks the
 * assertion itself.
 */

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
