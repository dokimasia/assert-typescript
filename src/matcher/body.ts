/**
 * The seat that an assertion makes for a body: an attempt of
 * `eventually`, or the check of `rejects`.
 *
 * The calls of the body are a run of the call that ran it, so they are
 * recorded under that call. The seat's signal derives from the signal of
 * the assertion's seat and aborts when the body ends, so work that the
 * body starts with it stops before the assertion returns. A failure that
 * stops ends the body, as it ends a test.
 */

import { own, run, type Slot } from "../record/calls.js";
import { type Seat, signalOf } from "./seat.js";

/** Thrown by the seat of a body to end the body at a failure that stops. */
export class Ended {}

/** The seat of one run of a body. */
export abstract class Body implements Seat {
  readonly #controller = new AbortController();
  /** Aborts when the assertion's seat's signal does, and when the body ends. */
  readonly signal: AbortSignal;

  /**
   * Returns the seat of a run of the body of the call that slot started.
   *
   * @param parent - The seat of the assertion that runs the body.
   * @param slot - The slot of that call, or undefined when it is not recorded.
   */
  constructor(parent: Seat, slot: Slot | undefined) {
    this.signal = AbortSignal.any([signalOf(parent), this.#controller.signal]);
    run(own(this), slot);
  }

  /** Do nothing; a body's seat has no frames worth hiding. */
  helper(): void {}

  /** Reports a failure that stops the body, and ends it. */
  abstract fail(message: string): never;

  /** Reports a failure that the body carries on past. */
  abstract record(message: string): void;

  /** Ends the body: the signal aborts. */
  end(): void {
    this.#controller.abort(new DOMException("the body ended", "AbortError"));
  }
}

/**
 * Runs body on seat, and ends the run when body returns, when its
 * promise settles, and at its first failure that stops. Any other throw
 * is no failure of the body, and rejects the call.
 *
 * @param seat - The seat of the run.
 * @param body - The body.
 * @returns seat, once the run has ended.
 */
export async function runOn<S extends Body>(
  seat: S,
  body: (seat: Seat) => unknown,
): Promise<S> {
  try {
    await body(seat);
  } catch (thrown) {
    if (!(thrown instanceof Ended)) throw thrown;
  } finally {
    seat.end();
  }
  return seat;
}
