/**
 * Catching an asynchronous assertion nobody awaited.
 *
 * Several assertions answer a promise, and a caller who forgets to
 * await one gets a green test that asserted nothing. TypeScript will
 * not catch it: the value is used, it is simply used as a promise.
 *
 * Tracking whether the work is still running is not enough. A test
 * body that awaits anything at all lets a dropped assertion settle,
 * and on an aborting seat its failure was thrown inside a promise
 * nobody holds, so the evidence is gone by the time the test ends.
 *
 * What is tracked instead is whether the caller ever awaited: the
 * returned promise notes it when `then` is called, which is what
 * `await`, `.then`, `.catch` and `.finally` all do. Anything the
 * caller never touched is reported when the seat is flushed.
 */

import type { Seat } from "./seat.js";

/** One assertion that was started, and whether anyone took its result. */
interface Pending {
  /** The message it was given, to name it in a report. */
  readonly msg: string;
  /** Whether the caller ever awaited it. */
  awaited: boolean;
}

/** What each seat has started, by seat. */
const STARTED = new WeakMap<Seat, Set<Pending>>();

/**
 * Register work against a seat, and note whether the caller takes it.
 *
 * @param seat The seat the assertion reports to.
 * @param msg The contract under test, used to name it if it is dropped.
 * @param work The assertion's own promise.
 * @returns A promise that settles with work and records being awaited.
 */
export function track<T>(seat: Seat, msg: string, work: Promise<T>): Promise<T> {
  const entry: Pending = { msg, awaited: false };
  let set = STARTED.get(seat);
  if (set === undefined) {
    set = new Set();
    STARTED.set(seat, set);
  }
  set.add(entry);

  // On an aborting seat a failure throws inside the promise. Silencing
  // the original keeps Node from reporting an unhandled rejection for
  // a case this library reports better itself. The caller's copy still
  // rejects.
  work.catch(() => undefined);

  return Tracked.of(entry, work);
}

/**
 * A promise that notes when the caller takes its result.
 *
 * A subclass rather than a patched `then`, because `await` on a plain
 * promise takes a fast path that never calls one: the engine sees an
 * unmodified native promise and reads its internal slots instead.
 * Subclassing takes that path away, so `await`, `.then`, `.catch` and
 * `.finally` all arrive here.
 */
class Tracked<T> extends Promise<T> {
  /** What this promise is, for the register. Absent on derived ones. */
  #entry: Pending | undefined;

  /**
   * Answer a tracked promise settling with work.
   *
   * @param entry The register's record of this assertion.
   * @param work The assertion's own promise.
   * @returns A promise that marks the entry taken when it is awaited.
   */
  static of<T>(entry: Pending, work: Promise<T>): Tracked<T> {
    const tracked = new Tracked<T>((resolve, reject) => {
      work.then(resolve, reject);
    });
    tracked.#entry = entry;

    // A dropped assertion on an aborting seat rejects, and nobody is
    // holding it. Marking it handled keeps Node from reporting an
    // unhandled rejection for something flush reports better. This
    // goes through the base `then` on purpose: the override would
    // record the drop as if the caller had taken it.
    Promise.prototype.then.call(tracked, undefined, () => undefined);
    return tracked;
  }

  /**
   * Note that the caller took this result, then behave as a promise.
   *
   * @param onFulfilled Called with the value, as on any promise.
   * @param onRejected Called with the reason, as on any promise.
   * @returns The onward promise.
   */
  // This is a Promise subclass, so `then` is the inherited member
  // being overridden rather than a `then` bolted onto an object.
  // biome-ignore lint/suspicious/noThenProperty: overriding Promise.then
  override then<A = T, B = never>(
    onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    if (this.#entry !== undefined) this.#entry.awaited = true;
    return super.then(onFulfilled, onRejected);
  }
}

/**
 * Answer which of a seat's assertions the caller never awaited.
 *
 * @param seat The seat to ask about.
 * @returns The message of each assertion started and never taken.
 */
export function dropped(seat: Seat): string[] {
  return [...(STARTED.get(seat) ?? [])].filter((p) => !p.awaited).map((p) => p.msg);
}

/**
 * Forget what a seat has started.
 *
 * Called after a flush has reported, so a seat used across phases does
 * not report the same dropped assertion twice.
 *
 * @param seat The seat to clear.
 */
export function clear(seat: Seat): void {
  STARTED.delete(seat);
}
