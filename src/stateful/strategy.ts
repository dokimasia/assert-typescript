/**
 * The strategies of the task scheduler: how it chooses the ready task to
 * release.
 */

/** How a Scheduler chooses the ready task to release. */
export interface Strategy {
  /** The depth of PCT, and 0 for the uniform strategy. */
  readonly depth: number;
}

/**
 * Returns the strategy that chooses each release among the ready tasks, in
 * the order that they became ready, uniformly, with target 0 and edge 0. A
 * release with one ready task records a choice that consumes nothing. A
 * shrunk schedule releases the tasks in the order that they became ready,
 * wherever the failure allows.
 *
 * @returns The strategy.
 */
export function uniform(): Strategy {
  return { depth: 0 };
}

/**
 * Returns the strategy of probabilistic concurrency testing of depth. Each
 * task receives a priority when it is spawned, a choice over [0, 2^64 − 1]
 * with target 0, and keeps it when it yields. The ready task with the
 * highest priority runs, the earliest ready among equals, and a release
 * makes no choice. Each run of the scheduler starts with depth − 1 change
 * points, each a presence choice with edge 1 and then a count of releases.
 * The task released at that count falls below every other task, and a later
 * change point puts its task lower still.
 *
 * @param depth - The depth, 1 or more.
 * @returns The strategy.
 * @throws RangeError for a depth that is no integer of 1 or more.
 */
export function pct(depth: number): Strategy {
  if (!Number.isSafeInteger(depth) || depth < 1) {
    throw new RangeError(`stateful: pct(${depth}) is no integer of 1 or more`);
  }
  return { depth };
}
