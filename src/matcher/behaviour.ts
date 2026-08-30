/**
 * The assertions about how a subject behaves, not what it answers.
 *
 * Go states cancellation with a `context.Context` in every signature.
 * JavaScript's equivalent is `AbortSignal`: it is what `fetch`, the
 * stream APIs and `events.once` all take, so a subject that can be
 * cancelled at all takes one.
 */

import { equal as compare } from "./compare.js";
import { show } from "./inspect.js";
import { type Option, settings } from "./option.js";
import { type Mode, report, type Seat } from "./seat.js";

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

/** Answer a signal that is already aborted, with the given reason. */
function alreadyAborted(reason: string): AbortSignal {
  const controller = new AbortController();
  controller.abort(Object.assign(new Error(reason), { name: "AbortError" }));
  return controller.signal;
}

/**
 * Fail when a subject given an aborted signal does not reject.
 *
 * The signal is aborted before the subject starts, so this asks
 * whether it checks at all rather than how quickly it notices. A
 * subject that ignores the signal settles normally, and fails here.
 */
export async function honoursCancellation(
  seat: Seat,
  mode: Mode,
  fn: Cancellable,
  msg: string,
): Promise<void> {
  seat.helper();
  const signal = alreadyAborted("cancelled before the subject started");
  try {
    await fn(signal);
  } catch (thrown) {
    if (isAbort(thrown, signal)) return;
    report(
      seat,
      mode,
      `${msg}: an aborted signal produced ${show(thrown)}, want a cancellation`,
    );
    return;
  }
  report(seat, mode, `${msg}: an aborted signal produced no rejection`);
}

/**
 * Fail when a subject given an expired deadline does not reject.
 *
 * This differs from cancellation in which failure it asks for: a
 * subject may tell a caller who gave up apart from one who ran out of
 * time, and `AbortSignal.timeout` aborts with a `TimeoutError`.
 */
export async function honoursDeadline(
  seat: Seat,
  mode: Mode,
  fn: Cancellable,
  msg: string,
): Promise<void> {
  seat.helper();
  const signal = AbortSignal.timeout(0);
  // The timeout fires on a later turn of the loop, so wait for it
  // rather than handing the subject a signal that has not fired yet.
  await new Promise((resolve) => setTimeout(resolve, 1));

  try {
    await fn(signal);
  } catch (thrown) {
    if (isAbort(thrown, signal)) return;
    report(
      seat,
      mode,
      `${msg}: an expired deadline produced ${show(thrown)}, want a timeout`,
    );
    return;
  }
  report(seat, mode, `${msg}: an expired deadline produced no rejection`);
}

/**
 * Fail when fn takes longer than within milliseconds.
 *
 * The subject is measured, not interrupted: one that runs long runs to
 * completion and then fails. This spends real time, up to however long
 * fn takes.
 */
export async function completesWithin(
  seat: Seat,
  mode: Mode,
  within: number,
  fn: () => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const started = performance.now();
  await fn();
  const elapsed = performance.now() - started;

  if (elapsed > within) {
    report(
      seat,
      mode,
      `${msg}: took ${elapsed.toFixed(1)}ms, want at most ${within}ms`,
    );
  }
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
  const before = await observe();
  await fn();
  const after = await observe();

  if (!compare(after, before, settings(options))) {
    report(
      seat,
      mode,
      `${msg}: observable state changed: was ${show(before)}, now ${show(after)}`,
    );
  }
}

/**
 * Fail when a subject given no cancellation handle crashes.
 *
 * Rejecting with an error of its own is fine and is usually right.
 * What fails here is dereferencing the missing signal, which is what a
 * caller does by accident and a middlebox by omission.
 */
export async function nullHandleSafe(
  seat: Seat,
  mode: Mode,
  fn: (signal: AbortSignal | undefined) => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  try {
    await fn(undefined);
  } catch (thrown) {
    if (thrown instanceof TypeError) {
      report(seat, mode, `${msg}: a missing handle caused ${show(thrown)}`);
    }
  }
}
