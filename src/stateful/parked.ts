// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The parked tasks of a scheduler: the tasks that wait for a condition, and
 * the tasks that sleep until a deadline of the scheduler's clock.
 */

/** The parked tasks of a scheduler, each with its condition or its deadline. */
export class Parked<T> {
  /** The tasks that wait, with their conditions, in the order of their waits. */
  #waiting: (readonly [task: T, condition: () => boolean])[] = [];
  /** The tasks that sleep, with their deadlines, in the order of their sleeps. */
  #sleeping: (readonly [task: T, deadline: bigint])[] = [];

  /**
   * Parks task until condition returns true.
   *
   * @param task - The task.
   * @param condition - The condition that ends the wait.
   */
  wait(task: T, condition: () => boolean): void {
    this.#waiting.push([task, condition]);
  }

  /**
   * Parks task until the clock reads deadline or a later time.
   *
   * @param task - The task.
   * @param deadline - The deadline, in nanoseconds since the Unix epoch.
   */
  sleep(task: T, deadline: bigint): void {
    this.#sleeping.push([task, deadline]);
  }

  /**
   * Returns the tasks that the clock at now wakes, in the order in which
   * they become ready, and parks them no longer: each sleeping task whose
   * deadline is now or earlier, by deadline and then in the order of the
   * sleeps, and then each waiting task whose condition returns true, in the
   * order of the waits. wake calls each condition once. A condition that
   * throws passes its error through.
   *
   * @param now - The time of the clock, in nanoseconds since the Unix epoch.
   * @returns The woken tasks.
   */
  wake(now: bigint): T[] {
    // The sort is stable, so the tasks of one deadline keep the order of their sleeps.
    const due = this.#sleeping
      .filter(([, deadline]) => deadline <= now)
      .sort(([, a], [, b]) => Number(a - b));
    this.#sleeping = this.#sleeping.filter(([, deadline]) => deadline > now);
    const met = this.#waiting.filter(([, condition]) => condition());
    this.#waiting = this.#waiting.filter((waiting) => !met.includes(waiting));
    return [...due, ...met].map(([task]) => task);
  }

  /**
   * Returns the earliest deadline of a sleeping task, or end when no
   * deadline is earlier.
   *
   * @param end - The latest time that the caller moves the clock to.
   * @returns The time.
   */
  earliest(end: bigint): bigint {
    let due = end;
    for (const [, deadline] of this.#sleeping) {
      if (deadline < due) {
        due = deadline;
      }
    }
    return due;
  }

  /** Ends every parked task, so none of them becomes ready again. */
  clear(): void {
    this.#waiting = [];
    this.#sleeping = [];
  }
}
