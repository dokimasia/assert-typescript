/**
 * The assertions about how a subject behaves, not what it answers.
 *
 * Go states cancellation with a `context.Context` in every signature.
 * JavaScript's equivalent is `AbortSignal`: it is what `fetch`, the
 * stream APIs and `events.once` all take, so a subject that can be
 * cancelled at all takes one.
 *
 * Each of these awaits, so each reads its call site when it starts.
 */

import { callSite } from "../failure.js";
import { equal as compare } from "./compare.js";
import { type Option, settings } from "./option.js";
import { clockOf, type Mode, type Seat, signalOf } from "./seat.js";
import { Running } from "./verdict.js";

/** A subject that takes a cancellation handle and answers a promise. */
export type Cancellable = (signal: AbortSignal) => Promise<unknown>;

/**
 * Whether a thrown value is a cancellation rather than a real failure.
 *
 * The signal's own reason counts, and so does anything named
 * AbortError or TimeoutError, which is what `AbortSignal.abort`,
 * `AbortSignal.timeout` and every web API built on them throw. A
 * subject that rejects with something else did not honour the signal;
 * it failed for its own reasons and happened to do so in time.
 */
function isAbort(thrown: unknown, signal: AbortSignal): boolean {
  if (signal.aborted && thrown === signal.reason) return true;
  if (thrown instanceof Error) {
    return thrown.name === "AbortError" || thrown.name === "TimeoutError";
  }
  return false;
}

/** Returns a signal that is already aborted, with an error of the given name. */
function aborted(name: "AbortError" | "TimeoutError", reason: string): AbortSignal {
  const controller = new AbortController();
  controller.abort(new DOMException(reason, name));
  return controller.signal;
}

/**
 * Hands fn an aborted signal and reports whether it rejected with a
 * cancellation: the failure states what it rejected with instead, or
 * null when it settled.
 */
async function honours(
  run: Running,
  mode: Mode,
  assertion: "honours-cancellation" | "honours-deadline",
  fn: Cancellable,
  signal: AbortSignal,
  msg: string,
): Promise<void> {
  try {
    await fn(signal);
  } catch (thrown) {
    if (isAbort(thrown, signal)) {
      run.pass(mode, assertion, msg);
      return;
    }
    run.fail(mode, assertion, msg, { got: thrown });
    return;
  }
  run.fail(mode, assertion, msg, { got: null });
}

/**
 * Fail when a subject given an aborted signal does not reject.
 *
 * The signal is aborted before the subject starts, so this asks
 * whether it checks at all rather than how quickly it notices. A
 * subject that ignores the signal settles normally, and fails here.
 */
export function honoursCancellation(
  seat: Seat,
  mode: Mode,
  fn: Cancellable,
  msg: string,
): Promise<void> {
  seat.helper();
  const signal = aborted("AbortError", "cancelled before the subject started");
  return honours(
    Running.of(seat, callSite()),
    mode,
    "honours-cancellation",
    fn,
    signal,
    msg,
  );
}

/**
 * Fail when a subject given an expired deadline does not reject.
 *
 * This differs from cancellation in which failure it hands the subject: a
 * subject may tell a caller who gave up apart from one who ran out of
 * time, and an expired deadline aborts with a `TimeoutError`, as
 * `AbortSignal.timeout` does.
 */
export function honoursDeadline(
  seat: Seat,
  mode: Mode,
  fn: Cancellable,
  msg: string,
): Promise<void> {
  seat.helper();
  const signal = aborted(
    "TimeoutError",
    "the deadline passed before the subject started",
  );
  return honours(
    Running.of(seat, callSite()),
    mode,
    "honours-deadline",
    fn,
    signal,
    msg,
  );
}

/** What ends the wait of completesWithin first: the subject, or its deadline. */
type Ending = { readonly settled: true } | { readonly settled: false };

/**
 * Fail when fn has not settled within milliseconds.
 *
 * fn receives a signal that aborts with a `TimeoutError` when the
 * duration has passed on the platform clock, and when the seat's signal
 * aborts, so a subject that watches it can stop in time. A subject that
 * has not settled when the duration has passed fails then, with got the
 * milliseconds waited, and the assertion does not wait for it. A subject
 * that settles is measured on the seat's clock, which a test can
 * control. A rejection settles the subject: failing quickly is still
 * finishing.
 */
export function completesWithin(
  seat: Seat,
  mode: Mode,
  within: number,
  fn: (signal: AbortSignal) => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const clock = clockOf(seat);
  const started = clock.now();
  const waited = performance.now();
  const deadline = new AbortController();
  const signal = AbortSignal.any([signalOf(seat), deadline.signal]);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Ending>((resolve) => {
    timer = setTimeout(() => {
      deadline.abort(new DOMException(`${within} ms passed`, "TimeoutError"));
      resolve({ settled: false });
    }, within);
  });
  const subject = Promise.resolve()
    .then(() => fn(signal))
    .then(
      () => ({ settled: true }) as const,
      () => ({ settled: true }) as const,
    );

  return Promise.race([subject, late]).then((ending) => {
    clearTimeout(timer);
    if (!ending.settled) {
      run.fail(mode, "completes-within", msg, {
        want: within,
        got: Math.round(performance.now() - waited),
      });
      return;
    }
    const elapsed = clock.now() - started;
    if (elapsed > within) {
      run.fail(mode, "completes-within", msg, {
        want: within,
        got: Math.round(elapsed),
      });
      return;
    }
    run.pass(mode, "completes-within", msg);
  });
}

/**
 * Fail when fn changes what observe reads.
 *
 * What observe answers defines what nothing means: whatever it leaves
 * out, fn is free to change. Answer a copy from observe, because a
 * projection sharing memory with the subject reads the same value
 * twice and passes whatever fn did.
 */
export async function isPure(
  seat: Seat,
  mode: Mode,
  observe: () => unknown,
  fn: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const before = await observe();
  await fn();
  const after = await observe();

  if (!compare(after, before, settings(options))) {
    run.fail(mode, "pure", msg, { want: before, got: after });
    return;
  }
  run.pass(mode, "pure", msg);
}

/**
 * Fail when a subject given no cancellation handle crashes.
 *
 * Rejecting with an error of its own is fine and is usually right.
 * What fails here is dereferencing the missing signal, a `TypeError`,
 * which is what a caller does by accident and a middlebox by omission.
 */
export async function nullHandleSafe(
  seat: Seat,
  mode: Mode,
  fn: (signal: AbortSignal | undefined) => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  try {
    await fn(undefined);
  } catch (thrown) {
    if (thrown instanceof TypeError) {
      run.fail(mode, "nil-context-safe", msg, { got: thrown });
      return;
    }
  }
  run.pass(mode, "nil-context-safe", msg);
}
