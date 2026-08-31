/**
 * The seats an assertion reports through.
 *
 * Which seat a test holds decides what each surface does:
 *
 * | Seat        | `check`   | `soft`                         |
 * | ----------- | --------- | ------------------------------ |
 * | `Collector` | throws    | collects, thrown when it ends  |
 * | `Standard`  | throws    | throws                         |
 * | `Recorder`  | collects  | collects                       |
 */

import { type Clock, System } from "./clock.js";
import { type Failure, render } from "./failure.js";
import { clear, dropped } from "./matcher/pending.js";
import type { Seat } from "./matcher/seat.js";

export type { Seat };

/** Raised by every seat that stops a test. */
export class AssertionFailed extends Error {
  /**
   * Return a failure carrying message.
   *
   * @param message What was supposed to be true, and what was not.
   */
  constructor(message: string) {
    super(message);
    this.name = "AssertionFailed";
  }
}

/**
 * A seat that throws on any failure.
 *
 * The seat to construct outside a test runner. Its `record` throws
 * too: a recorded failure needs somewhere to report at the end, and a
 * bare seat has no end to report at. Throwing early beats dropping it.
 */
export class Standard implements Seat {
  /** Do nothing; there is no runner here to hide frames from. */
  helper(): void {}

  /**
   * Throw, stopping the test here.
   *
   * @param message What was supposed to be true.
   */
  fail(message: string): never {
    throw new AssertionFailed(message);
  }

  /**
   * Throw; this seat cannot collect a failure and carry on.
   *
   * @param message What was supposed to be true.
   */
  record(message: string): never {
    throw new AssertionFailed(message);
  }
}

/**
 * A seat that collects every failure and throws none.
 *
 * This is what lets an assertion be tested by reading what it reported
 * rather than suffering it. Nothing driven with a recorder can fail a
 * test.
 */
export class Recorder implements Seat {
  /** Every record that arrived, in call order. */
  #records: Failure[] = [];
  /** What assertions read time from, or undefined for the platform. */
  #clock: Clock | undefined;

  /**
   * Record one failure as the record it is.
   *
   * This is what lets a test read the assertion's own fields rather
   * than search its sentence for words. The rendered sentence is kept
   * too, so message answers what it always did.
   *
   * @param failure The record the assertion reported.
   * @param aborting Whether it came from the aborting surface.
   */
  report(failure: Failure, aborting: boolean): void {
    this.#records.push(failure);
    if (aborting) {
      this.fail(render(failure));
      return;
    }
    this.record(render(failure));
  }

  /**
   * Every record that arrived, in call order.
   *
   * A message passed straight to fail or record leaves none, so an
   * assertion that did not report a record is visible here.
   */
  get failures(): readonly Failure[] {
    return [...this.#records];
  }

  /**
   * The clock this seat hands assertions.
   *
   * @returns What withClock set, or the platform clock.
   */
  clock(): Clock {
    return this.#clock ?? new System();
  }

  /**
   * Make assertions reported here read clock rather than the platform.
   *
   * @param clock Where those assertions read time.
   * @returns The receiver, so the call chains onto the constructor.
   */
  withClock(clock: Clock): this {
    this.#clock = clock;
    return this;
  }

  #fatal: string | undefined;
  #recorded: string[] = [];
  #helpers = 0;

  /** Count one helper-frame mark. */
  helper(): void {
    this.#helpers += 1;
  }

  /**
   * Collect a failure. The first fatal message is the one kept.
   *
   * @param message What was supposed to be true.
   */
  fail(message: string): void {
    this.#fatal ??= message;
  }

  /**
   * Collect a failure and return.
   *
   * @param message What was supposed to be true.
   */
  record(message: string): void {
    this.#recorded.push(message);
  }

  /** Whether any failure was recorded, through either path. */
  get failed(): boolean {
    return this.#fatal !== undefined || this.#recorded.length > 0;
  }

  /**
   * The first failure recorded, preferring the aborting path.
   *
   * Empty when nothing failed. Reading this rather than indexing a
   * list keeps a test from throwing when the assertion under test
   * wrongly reported nothing.
   */
  get message(): string {
    return this.#fatal ?? this.#recorded[0] ?? "";
  }

  /** Every failure recorded through `record`, in call order. */
  get messages(): string[] {
    return [...this.#recorded];
  }

  /** How many times `helper` was called. */
  get helperCalls(): number {
    return this.#helpers;
  }
}

/**
 * A seat that throws on a check and collects what soft records.
 *
 * This is what a real test wants. An aborting assertion throws where
 * it stands; a recording one is kept until {@link Collector.flush},
 * which the runner adapter calls once the test body is done, so
 * several failing properties of one value are all reported at once.
 */
export class Collector implements Seat {
  #collected: string[] = [];

  /** Do nothing; the adapter hides frames, not the seat. */
  helper(): void {}

  /**
   * Throw, stopping the test here.
   *
   * @param message What was supposed to be true.
   */
  fail(message: string): never {
    throw new AssertionFailed(message);
  }

  /**
   * Keep a failure, and let the test carry on.
   *
   * @param message What was supposed to be true.
   */
  record(message: string): void {
    this.#collected.push(message);
  }

  /** Every failure kept so far, in call order. */
  get collected(): string[] {
    return [...this.#collected];
  }

  /**
   * Throw one failure carrying everything collected.
   *
   * Returns when nothing was collected. Clears what it threw, so a
   * seat reused across phases does not report a failure twice.
   *
   * An asynchronous assertion still running is reported here too. A
   * caller who forgot to await one would otherwise get a green test
   * that asserted nothing, which no type checker catches: the promise
   * was used, it was simply used as a promise.
   */
  flush(): void {
    const forgotten = dropped(this);
    if (forgotten.length > 0) {
      clear(this);
      const listed = forgotten.map((m) => `  - ${m}`).join("\n");
      throw new AssertionFailed(
        `${forgotten.length} assertion(s) were never awaited, so they ` +
          `asserted nothing:\n${listed}\nAdd \`await\` to the call.`,
      );
    }
    clear(this);
    if (this.#collected.length === 0) return;

    const collected = this.#collected;
    this.#collected = [];
    if (collected.length === 1) {
      throw new AssertionFailed(collected[0] as string);
    }

    const listed = collected.map((m, i) => `  ${i + 1}. ${m}`).join("\n");
    throw new AssertionFailed(`${collected.length} failures:\n${listed}`);
  }
}
