/**
 * The assertions that retry, and the one that checks nothing was left
 * running.
 *
 * These wait on the seat's clock. On the platform clock they spend real
 * time, so they suit a condition that something outside the test makes
 * true. On a controlled clock they advance it between attempts and spend
 * none.
 */

import { type Clock, wait } from "../clock.js";
import { callSite } from "../failure.js";
import { own } from "../record/calls.js";
import { Body, Ended, runOn } from "./body.js";
import { clockOf, type Mode, type Seat } from "./seat.js";
import { fail, pass, Running } from "./verdict.js";

/** The shortest wait between two attempts. Every wait moves a controlled clock forward. */
const MIN_WAIT = 1;

/**
 * The seat of one attempt of a body, which keeps the attempt's first
 * failure instead of reporting it.
 */
class Attempt extends Body {
  #message: string | undefined;
  #failed = false;

  /** Keeps the first failure of this attempt, and ends the attempt. */
  fail(message: string): never {
    this.record(message);
    throw new Ended();
  }

  /** Keeps the first failure of this attempt. */
  record(message: string): void {
    this.#failed = true;
    this.#message ??= message;
  }

  /** Whether the attempt failed, and its first failure's message. */
  get outcome(): { readonly failed: boolean; readonly message: string } {
    return { failed: this.#failed, message: this.#message ?? "" };
  }
}

/**
 * Waits d on clock, or the time left before deadline when that is less,
 * and reports whether another attempt may start: whether the clock read
 * before the deadline, and after the wait reads no later than it.
 */
async function waitWithin(clock: Clock, deadline: number, d: number): Promise<boolean> {
  const now = clock.now();
  if (!(now < deadline)) return false;
  await wait(clock, Math.min(d, deadline - now));
  return !(clock.now() > deadline);
}

/**
 * Fail when a body of assertions never passes within the timeout.
 *
 * The body is handed a seat of its own, so assertions inside it record
 * an attempt rather than ending the test. It runs at least once
 * however short the timeout, and the failure carries the last
 * attempt's own reason rather than a bare timeout. No attempt starts
 * after the timeout, and an attempt passes the call only when it ends by
 * the deadline. The calls of each attempt are recorded under the call of
 * eventually.
 */
export async function eventually(
  seat: Seat,
  mode: Mode,
  timeout: number,
  interval: number,
  body: (trial: Seat) => void | Promise<void>,
  msg: string,
): Promise<void> {
  seat.helper();
  const call = Running.begin(seat, callSite());
  const clock = clockOf(seat);
  const deadline = clock.now() + timeout;

  for (let attempts = 1; ; attempts += 1) {
    const trial = await runOn(new Attempt(seat, call.slot), body);
    call.slot?.take(own(trial));
    const { failed, message } = trial.outcome;
    if (!failed && !(clock.now() > deadline)) {
      call.pass(mode, "eventually", msg);
      return;
    }
    if (!(await waitWithin(clock, deadline, Math.max(interval, MIN_WAIT)))) {
      call.fail(mode, "eventually", msg, { attempts, last: message });
      return;
    }
  }
}

/**
 * Fail when a predicate never becomes true within the timeout.
 *
 * Retried with a backoff that starts at a millisecond and doubles,
 * capped at a quarter of the timeout so the last attempts are not one
 * long sleep. A predicate carries no reason, so the failure says only
 * that the wait ran out; where the reason matters, write the condition
 * as assertions and use {@link eventually}.
 */
export async function eventuallyTrue(
  seat: Seat,
  mode: Mode,
  timeout: number,
  predicate: () => boolean | Promise<boolean>,
  msg: string,
): Promise<void> {
  seat.helper();
  const call = Running.of(seat, callSite());
  const clock = clockOf(seat);
  const deadline = clock.now() + timeout;
  const cap = Math.max(timeout / 4, MIN_WAIT);
  let backoff = MIN_WAIT;

  for (let attempts = 1; ; attempts += 1) {
    if ((await predicate()) && !(clock.now() > deadline)) {
      call.pass(mode, "eventually-true", msg);
      return;
    }
    if (!(await waitWithin(clock, deadline, backoff))) {
      call.fail(mode, "eventually-true", msg, { attempts });
      return;
    }
    backoff = Math.min(Math.max(2 * backoff, MIN_WAIT), cap);
  }
}

/**
 * Answer a callable that fails when work started in the scope outlives
 * it.
 *
 * JavaScript has no task registry, so this reads Node's active
 * resources: a timer, a socket or a file handle still open when the
 * scope closes. That covers what leaks in practice, and it is the same
 * question Go's goroutine check asks.
 *
 * A promise nobody settles is not among them. Node holds no list of
 * pending promises, so one that never resolves is invisible here.
 */
export function noTaskLeaks(seat: Seat, mode: Mode, msg: string): () => void {
  seat.helper();
  const before = tally(process.getActiveResourcesInfo());

  return () => {
    seat.helper();
    const after = tally(process.getActiveResourcesInfo());

    const leaked: string[] = [];
    for (const [kind, count] of after) {
      const started = count - (before.get(kind) ?? 0);
      if (started > 0) leaked.push(`${started} ${kind}`);
    }
    if (leaked.length > 0) {
      fail(seat, mode, "no-task-leaks", msg, { leaked: leaked.sort() });
      return;
    }
    pass(seat, mode, "no-task-leaks", msg);
  };
}

/** Count how many resources of each kind are active. */
function tally(kinds: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
}
