/**
 * The seats an assertion reports through.
 *
 * The seat that a test passes decides what each surface does:
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
import type { Cleanups, Seat } from "./matcher/seat.js";
import { faultText } from "./matcher/verdict.js";
import { keep, lines, own } from "./record/calls.js";

export { signalOf } from "./matcher/seat.js";
export type { Cleanups, Seat };

/** Raised by every seat that stops a test. */
export class AssertionFailed extends Error {
  /**
   * Returns a failure with message.
   *
   * @param message What was supposed to be true, and what was not.
   */
  constructor(message: string) {
    super(message);
    this.name = "AssertionFailed";
  }
}

/**
 * Throws when this seat has assertions that nobody awaited.
 *
 * Several assertions return a promise, and a caller who drops one gets a
 * green test that asserted nothing. No type checker catches it, because
 * the caller used the promise as a value.
 *
 * @param seat The seat whose started work is being closed off.
 * @throws AssertionFailed naming every assertion that was dropped.
 */
function reportDropped(seat: Seat): void {
  const forgotten = dropped(seat);
  clear(seat);
  if (forgotten.length === 0) return;

  const listed = forgotten.map((m) => `  - ${m}`).join("\n");
  throw new AssertionFailed(
    `${forgotten.length} assertion(s) were never awaited, so they ` +
      `asserted nothing:\n${listed}\nAdd \`await\` to the call.`,
  );
}

/**
 * A seat that throws on any failure.
 *
 * The seat to construct outside a test runner. Its `record` throws too: a
 * recorded failure needs a place to be reported at the end of the test,
 * and a bare seat has no end of test, so it throws the failure at once
 * rather than drop it. It has no signal, and writes no call record.
 */
export class Standard implements Seat {
  /** Does nothing, because no runner hides frames here. */
  helper(): void {}

  /**
   * Throws, which stops the test here.
   *
   * @param message What was supposed to be true.
   */
  fail(message: string): never {
    throw new AssertionFailed(message);
  }

  /**
   * Throws, because this seat cannot collect a failure and continue.
   *
   * @param message What was supposed to be true.
   */
  record(message: string): never {
    throw new AssertionFailed(message);
  }

  /**
   * Throws for any asynchronous assertion that nobody awaited.
   *
   * This seat throws each failure the moment it arrives, so it has nothing
   * collected to report. It cannot see an assertion whose promise was
   * dropped: that failure was thrown inside a promise that nobody awaited.
   * Call this where the test ends.
   */
  flush(): void {
    reportDropped(this);
  }
}

/**
 * A seat that collects every failure and throws none.
 *
 * A test of an assertion reads what the assertion reported on it, rather
 * than being stopped by it. Nothing driven with a recorder can fail a test.
 * It keeps the call record of every call it receives, whatever
 * `DOKIMI_ASSERT_RECORD` states.
 */
export class Recorder implements Seat {
  /** Every record that arrived, in call order. */
  #records: Failure[] = [];
  /** What assertions read time from, or undefined for the platform. */
  #clock: Clock | undefined;
  /** The signal that this recorder states, or undefined for none. */
  #signal: AbortSignal | undefined;
  #fatal: string | undefined;
  #recorded: string[] = [];
  #helpers = 0;

  /** Returns a recorder that has received nothing. */
  constructor() {
    keep(own(this));
  }

  /**
   * Records one failure as the record it is.
   *
   * A test reads the assertion's own fields from the record, rather than
   * search its sentence for words. The recorder keeps the rendered sentence
   * too, which `message` returns.
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

  /** The call records of this recorder's calls, in the order of their seq, as JSON lines. */
  get records(): readonly string[] {
    return lines(own(this));
  }

  /**
   * Returns the clock that this seat hands assertions.
   *
   * @returns What withClock set, or the platform clock.
   */
  clock(): Clock {
    return this.#clock ?? new System();
  }

  /**
   * Makes the assertions reported here read clock rather than the platform.
   *
   * @param clock Where those assertions read time.
   * @returns The receiver, so the call chains onto the constructor.
   */
  withClock(clock: Clock): this {
    this.#clock = clock;
    return this;
  }

  /** The signal that withSignal set, or undefined for none. */
  get signal(): AbortSignal | undefined {
    return this.#signal;
  }

  /**
   * Makes signal the signal of this recorder.
   *
   * @param signal - What an assertion reported here hands the code under test.
   * @returns The receiver, so the call chains onto the constructor.
   */
  withSignal(signal: AbortSignal): this {
    this.#signal = signal;
    return this;
  }

  /** Counts one helper-frame mark. */
  helper(): void {
    this.#helpers += 1;
  }

  /**
   * Collects a failure. The recorder keeps the first fatal message.
   *
   * @param message What was supposed to be true.
   */
  fail(message: string): void {
    this.#fatal ??= message;
  }

  /**
   * Collects a failure and returns.
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
   * The first failure recorded, the aborting path's first.
   *
   * Empty when nothing failed. A test that reads this rather than an
   * index of a list does not throw when the assertion under test wrongly
   * reported nothing.
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

/** The functions that each collector runs when its test ends, in the order of their registration. */
const CLEANUPS = new WeakMap<Collector, (() => void)[]>();

/**
 * A seat that throws on a check and collects what soft records.
 *
 * The seat of a real test. An aborting assertion throws at the call; a
 * recording one is kept until {@link Collector.flush}, which the runner
 * adapter calls once the test body is done, so several failing properties
 * of one value are all reported at once.
 */
export class Collector implements Seat, Cleanups {
  #collected: string[] = [];
  /** The signal that this collector states, or undefined for none. */
  #signal: AbortSignal | undefined;

  /** Does nothing, because the adapter hides frames, not the seat. */
  helper(): void {}

  /**
   * Throws, which stops the test here.
   *
   * @param message What was supposed to be true.
   */
  fail(message: string): never {
    throw new AssertionFailed(message);
  }

  /**
   * Keeps a failure, and lets the test continue.
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

  /** The signal that withSignal set, or undefined for none. */
  get signal(): AbortSignal | undefined {
    return this.#signal;
  }

  /**
   * Makes signal the signal of this collector: the signal of the test that
   * runs on it.
   *
   * @param signal - What an assertion reported here hands the code under test.
   * @returns The receiver, so the call chains onto the constructor.
   */
  withSignal(signal: AbortSignal): this {
    this.#signal = signal;
    return this;
  }

  /**
   * Registers fn to run when the test ends, also when the test fails. The
   * fixture of `@dokimi/assert/vitest` runs the functions after the test
   * body, in the reverse order of their registration, and reports each
   * function that throws as a failure of the test.
   *
   * @param fn - The function, such as the removal of a directory that the
   *   test created.
   */
  cleanup(fn: () => void): void {
    const registered = CLEANUPS.get(this) ?? [];
    registered.push(fn);
    CLEANUPS.set(this, registered);
  }

  /**
   * Throws one failure with everything collected.
   *
   * Returns when nothing was collected. Clears what it threw, so a seat
   * reused across phases does not report a failure twice.
   *
   * An asynchronous assertion that nobody awaited is reported here too. A
   * caller who forgot to await one would otherwise get a green test that
   * asserted nothing, which no type checker catches, because the caller
   * used the promise as a value.
   */
  flush(): void {
    reportDropped(this);
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

/**
 * Runs the functions that collector registered through `cleanup`, the
 * last registered first, and forgets them. A function that throws does
 * not stop the ones after it: the collector records its error as a
 * failure, which the next flush reports.
 *
 * @param collector - The seat of the test that ended.
 */
export function cleanUp(collector: Collector): void {
  const registered = CLEANUPS.get(collector) ?? [];
  CLEANUPS.delete(collector);
  for (const fn of registered.reverse()) {
    try {
      fn();
    } catch (err) {
      collector.record(`a cleanup failed: ${faultText(err)}`);
    }
  }
}
