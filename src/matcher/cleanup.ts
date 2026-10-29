// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The list of the cleanups of a seat: the functions that the seat runs when
 * its test or its body ends, the last registered first.
 */

/** The functions that a seat keeps until its test or its body ends. */
export class CleanupList {
  /** The kept functions, in the order of their registration. */
  readonly #fns: (() => unknown)[] = [];
  /** Whether close has run. A closed list does not keep a function. */
  #closed: boolean;

  /** Returns an empty list. */
  constructor() {
    this.#closed = false;
  }

  /**
   * Keeps fn until the next run.
   *
   * @param fn - The function.
   * @returns False when the list has closed, and then it does not keep fn.
   */
  add(fn: () => unknown): boolean {
    if (this.#closed) {
      return false;
    }
    this.#fns.push(fn);
    return true;
  }

  /**
   * Passes each kept function to each, the last kept first, and forgets
   * it. It awaits each pass before the next one starts. A function that a
   * function keeps runs in the same pass.
   *
   * @param each - Runs one function.
   */
  run(each: (fn: () => unknown) => Promise<void>): Promise<void> {
    return this.#drain(each, false);
  }

  /**
   * Runs the kept functions as run does, and then closes the list. After
   * that, add returns false for each later function.
   *
   * @param each - Runs one function.
   */
  close(each: (fn: () => unknown) => Promise<void>): Promise<void> {
    return this.#drain(each, true);
  }

  /** Passes each kept function to each, and closes the list when closing is true and none is left. */
  async #drain(
    each: (fn: () => unknown) => Promise<void>,
    closing: boolean,
  ): Promise<void> {
    const fn = this.#fns.pop();
    if (fn === undefined) {
      if (closing) {
        this.#closed = true;
      }
      return;
    }
    await each(fn);
    await this.#drain(each, closing);
  }
}
