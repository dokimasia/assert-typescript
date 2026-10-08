/**
 * The seam every assertion reports through.
 *
 * An assertion never calls a test runner and never throws on its own.
 * It reports to whatever seat it is handed, which is what lets one
 * assertion serve a real test, a benchmark and a test that checks the
 * assertion itself.
 */

import { type Clock, System } from "../clock.js";
import type { Failure } from "../failure.js";

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

  /** Aborts when the test that runs on this seat ends, where the seat states one. */
  readonly signal?: AbortSignal | undefined;
}

/** A seat that runs functions when the test that runs on it ends. */
export interface Cleanups {
  /**
   * Registers fn to run when the test ends, also when the test fails. The
   * functions run in the reverse order of their registration.
   */
  cleanup(fn: () => void): void;
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
 * Send one sentence to the seat, under the given mode: through `record`
 * under {@link Mode.Soft} and through `fail` under {@link Mode.Fatal},
 * where it may not return.
 *
 * @param seat - Where the failure is reported.
 * @param mode - Whether the failure stops the test or is recorded.
 * @param message - The failure text, already formatted.
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
export interface Reporter {
  /**
   * Receives one failure record.
   *
   * @param failure - The record of the failing call.
   * @param aborting - True for the aborting surface, false for the recording one.
   */
  report(failure: Failure, aborting: boolean): void;
}

/**
 * Reports whether a seat takes records.
 *
 * @param seat - The seat of a call.
 * @returns True when the seat has a `report` member.
 */
export function takesRecords(seat: Seat): seat is Seat & Reporter {
  return typeof (seat as Partial<Reporter>).report === "function";
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

/** The path of the test that each seat runs: its file's path and its titles. */
const TESTS = new WeakMap<Seat, readonly string[]>();

/**
 * Names the test that seat runs: the segments of its file's path relative
 * to the working directory, then the titles of its describe blocks and its
 * own title. A property keeps its store under that path.
 *
 * @param seat - The seat of the test.
 * @param path - The segments.
 */
export function nameTest(seat: Seat, path: readonly string[]): void {
  TESTS.set(seat, path);
}

/**
 * Returns the path of the test that seat runs, or undefined for a seat that
 * runs no named test.
 *
 * @param seat - The seat.
 * @returns The segments of the path.
 */
export function testOf(seat: Seat): readonly string[] | undefined {
  return TESTS.get(seat);
}

/** The signal of a seat without one: its controller is unreachable, so it never aborts. */
const NEVER = new AbortController().signal;

/**
 * Returns the seat's signal, or a signal that never aborts for a seat
 * without one.
 *
 * @param seat - The seat of a call.
 * @returns The seat's `signal`, or one that never aborts.
 */
export function signalOf(seat: Seat): AbortSignal {
  return seat.signal ?? NEVER;
}
