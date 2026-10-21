/**
 * The record of the asynchronous matchers that each test starts.
 *
 * A runner takes the promise of a matcher as soon as the matcher returns,
 * so a matcher cannot see whether the test awaits it. The runner's adapter
 * reads the record when a test ends instead. A matcher that has not
 * settled then was not awaited, and it asserted nothing.
 */

import { siteIn, stackOf } from "../failure.js";

/** The call of an asynchronous matcher, from its start until it settles. */
export class Call {
  /** The matcher's name. */
  readonly name: string;
  /** The stack of the call's start, whose frames of the caller locate the call. */
  readonly #origin: string;
  #settled = false;
  #failed = false;
  #abandoned = false;

  /**
   * Returns the call of the matcher name, and captures the stack of the
   * call.
   *
   * @param name - The matcher's name.
   */
  constructor(name: string) {
    this.name = name;
    this.#origin = stackOf(name);
  }

  /** Whether the matcher has settled. */
  get settled(): boolean {
    return this.#settled;
  }

  /** Whether the matcher settled with a failure. */
  get failed(): boolean {
    return this.#failed;
  }

  /** Whether the test ended before the matcher settled. */
  get abandoned(): boolean {
    return this.#abandoned;
  }

  /**
   * Marks the call settled.
   *
   * @param failed - Whether the matcher failed.
   */
  settle(failed: boolean): void {
    this.#settled = true;
    this.#failed = failed;
  }

  /** Marks the call abandoned, because its test ended before it settled. */
  abandon(): void {
    this.#abandoned = true;
  }

  /**
   * Returns the error of a call that its test ended before, located at the
   * call in the test.
   *
   * @returns The error.
   */
  neverAwaited(): Error {
    return this.#error(
      `${this.name} was never awaited, so it asserted nothing. Add await to the call.`,
    );
  }

  /**
   * Returns the error of a call that failed in a test that did not await
   * it, located at the call in the test.
   *
   * @returns The error.
   */
  failedUnawaited(): Error {
    return this.#error(
      `${this.name} failed, and the test did not await it. Add await to the call.`,
    );
  }

  /** Returns an error of message whose stack has the caller's frames of the call's start. */
  #error(message: string): Error {
    const error = new Error(message);
    const frames = this.#origin
      .split("\n")
      .slice(1)
      .filter((frame) => siteIn(`\n${frame}`) !== undefined);
    error.stack = [`Error: ${message}`, ...frames].join("\n");
    return error;
  }
}

/** The calls of asynchronous matchers, by the test that started them. */
export class Pending {
  readonly #tests = new Map<unknown, Call[]>();

  /**
   * Starts the call of the matcher name in test.
   *
   * @param test - The test, as the runner identifies it.
   * @param name - The matcher's name.
   * @returns The call.
   */
  start(test: unknown, name: string): Call {
    const call = new Call(name);
    const calls = this.#tests.get(test);
    if (calls === undefined) this.#tests.set(test, [call]);
    else calls.push(call);
    return call;
  }

  /**
   * Reports whether test has started a call that the record keeps.
   *
   * @param test - The test.
   * @returns Whether it has.
   */
  has(test: unknown): boolean {
    return this.#tests.has(test);
  }

  /**
   * Ends test: forgets its calls, and marks each call that has not settled
   * abandoned.
   *
   * @param test - The test.
   * @returns The calls of the test, in the order of their start.
   */
  end(test: unknown): readonly Call[] {
    const calls = this.#tests.get(test) ?? [];
    this.#tests.delete(test);
    for (const call of calls) if (!call.settled) call.abandon();
    return calls;
  }
}
