/**
 * The assertions that retry, and the one that checks nothing was left
 * running.
 *
 * These spend real time, deliberately. They are for a condition
 * something outside the test makes true, which is exactly what a
 * controlled clock cannot reach: a fake clock only moves when someone
 * advances it, and nobody will while this is awaiting. Where the
 * subject reads a clock the test controls, drive that clock and assert
 * the answer instead.
 */

import { type Mode, report, type Seat } from "./seat.js";

/**
 * A seat that keeps one trial's failure instead of reporting it.
 *
 * Not the public recorder: a retry loop needs nothing more than
 * whether the attempt failed and with what.
 */
class Trial implements Seat {
  #message: string | undefined;

  /** Do nothing; a trial has no frames worth hiding. */
  helper(): void {}

  /** Keep the first failure of this attempt. */
  fail(message: string): void {
    this.#message ??= message;
  }

  /** Keep the first failure of this attempt. */
  record(message: string): void {
    this.#message ??= message;
  }

  /** The attempt's failure, or undefined when it passed. */
  get failure(): string | undefined {
    return this.#message;
  }
}

/** Wait for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fail when a body of assertions never passes within the timeout.
 *
 * The body is handed a seat of its own, so assertions inside it record
 * an attempt rather than ending the test. It runs at least once
 * however short the timeout, and the failure carries the last
 * attempt's own reason rather than a bare timeout.
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
  const deadline = performance.now() + timeout;

  for (let attempt = 1; ; attempt += 1) {
    const trial = new Trial();
    await body(trial);

    const failure = trial.failure;
    if (failure === undefined) return;

    if (performance.now() > deadline) {
      report(
        seat,
        mode,
        `${msg}: still failing after ${timeout}ms and ${attempt} attempts: ${failure}`,
      );
      return;
    }
    await sleep(interval);
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
  const deadline = performance.now() + timeout;
  const cap = timeout / 4;
  let backoff = 1;

  for (let attempt = 1; ; attempt += 1) {
    if (await predicate()) return;

    if (performance.now() > deadline) {
      report(
        seat,
        mode,
        `${msg}: still false after ${timeout}ms and ${attempt} attempts`,
      );
      return;
    }
    await sleep(backoff);
    backoff = Math.min(backoff * 2, cap > 0 ? cap : backoff * 2);
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
      report(seat, mode, `${msg}: still running: ${leaked.sort().join(", ")}`);
    }
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
