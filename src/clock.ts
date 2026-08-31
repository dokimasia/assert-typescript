/**
 * Where an assertion reads time.
 *
 * An assertion that waits, retries or measures reads a clock the seat
 * carries rather than calling the platform, so a test can supply time
 * it controls and a busy machine cannot make the assertion flaky.
 */

/** The two readings an assertion needs from time. */
export interface Clock {
  /**
   * Answer the current instant, in milliseconds.
   *
   * @returns A reading comparable against another from the same clock.
   */
  now(): number;
  /**
   * Block until the duration has passed on this clock.
   *
   * @param duration - Milliseconds to wait.
   */
  sleep(duration: number): Promise<void>;
}

/**
 * Reads the platform clock.
 *
 * This is what an assertion gets when the seat carries no other, so an
 * assertion that reads time behaves as it did before a clock existed.
 */
export class System implements Clock {
  /**
   * Answer the platform's reading, in milliseconds.
   *
   * @returns Milliseconds from an arbitrary origin.
   */
  now(): number {
    return performance.now();
  }

  /**
   * Wait for duration against the platform clock.
   *
   * @param duration - Milliseconds to wait.
   * @returns A promise settling once the time has passed.
   */
  sleep(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }
}

/**
 * A clock that moves only when a test advances it.
 *
 * now answers what advance last left it at, and sleep settles once the
 * clock has passed the duration rather than once the wall has. An
 * assertion that retries advances this clock between attempts rather
 * than sleeping against it, so a body that settles on the third
 * attempt costs three attempts and no waiting.
 *
 * A controlled clock cannot reach the subject: code under test that
 * calls the platform directly reads a different now, and nothing here
 * detects that.
 */
export class Controlled implements Clock {
  #instant: number;
  /** What each pending sleep is waiting for, and how to release it. */
  #waiting: { until: number; wake: () => void }[] = [];

  /**
   * Start a clock reading start until it is advanced.
   *
   * @param start - The instant it reads before anything advances it.
   */
  constructor(start = 0) {
    this.#instant = start;
  }

  /**
   * Answer the instant this clock was last advanced to.
   *
   * @returns Milliseconds, as advance has left them.
   */
  now(): number {
    return this.#instant;
  }

  /**
   * Move the clock forward and settle every sleep the new instant passed.
   *
   * A duration that is not positive does not move it backwards; time
   * on this clock only goes forward.
   *
   * @param duration - Milliseconds to move forward by.
   */
  advance(duration: number): void {
    if (duration <= 0) return;
    this.#instant += duration;

    const due = this.#waiting.filter((w) => w.until <= this.#instant);
    this.#waiting = this.#waiting.filter((w) => w.until > this.#instant);
    for (const waiter of due) waiter.wake();
  }

  /**
   * Settle once the clock has passed duration.
   *
   * It settles at once when duration is not positive. Otherwise it
   * waits for advance, so a test that awaits this without advancing
   * waits forever.
   *
   * @param duration - Milliseconds to wait.
   * @returns A promise settling once the clock has passed it.
   */
  sleep(duration: number): Promise<void> {
    if (duration <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.#waiting.push({ until: this.#instant + duration, wake: resolve });
    });
  }
}

/**
 * Move time forward by duration.
 *
 * A clock a test controls is advanced, because nothing else will move
 * it while this call is running. Any other clock is slept against.
 *
 * @param clock - Where time is read.
 * @param duration - Milliseconds to move forward by.
 */
export async function wait(clock: Clock, duration: number): Promise<void> {
  if (clock instanceof Controlled) {
    clock.advance(duration);
    return;
  }
  await clock.sleep(duration);
}
