// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The memo of the configurations that the search of one partition visited.
 *
 * A configuration is a set of linearized calls and the states that they
 * leave, no two of them equal. The memo covers a configuration when it
 * stores one with the same states in any order and the same calls with a
 * completion entry, whose other calls are among the configuration's. A call
 * without a completion entry need not take effect, so every order that
 * follows the configuration also follows the one in the memo. The memo
 * counts one bit per call of the partition for each configuration that it
 * stores.
 */

/** The radix of the set of linearized calls in the name of a configuration. */
const HEX_RADIX = 16;

/** How the memo took a configuration: it covered it, stored it, or had no room for it. */
export type Visit = "covered" | "stored" | "full";

/** The memo of one search. */
export class Memo<S> {
  /** The set of calls without a completion entry, a bit per position. */
  readonly #optional: bigint;
  /** The number of calls of the partition, the bits of one configuration. */
  readonly #calls: number;
  /** The most bits that the memo stores. */
  readonly #limit: number;
  /** The stored configurations by their calls with a completion entry and their keys, each with its calls and its states. */
  readonly #configurations = new Map<string, [done: bigint, states: readonly S[]][]>();
  #stored = 0;

  /**
   * Returns an empty memo.
   *
   * @param optional - The set of calls without a completion entry, a bit per
   *   position.
   * @param calls - The number of calls of the partition.
   * @param limit - The most bits that the memo stores.
   */
  constructor(optional: bigint, calls: number, limit: number) {
    this.#optional = optional;
    this.#calls = calls;
    this.#limit = limit;
  }

  /**
   * Stores a configuration unless a configuration of the memo covers it.
   *
   * @param done - The set of linearized calls, a bit per position.
   * @param keys - The distinct keys of the states, sorted.
   * @param states - The states, no two of them equal.
   * @param equal - Reports whether two states are equal.
   * @returns covered for a configuration that the memo covers, full for one
   *   that would take the memo past its limit, and stored otherwise.
   */
  visit(
    done: bigint,
    keys: readonly string[],
    states: readonly S[],
    equal: (a: S, b: S) => boolean,
  ): Visit {
    const known = done & ~this.#optional;
    const name = `${known.toString(HEX_RADIX)}|${JSON.stringify(keys)}`;
    const bucket = this.#configurations.get(name) ?? [];
    for (const [taken, seen] of bucket) {
      if (
        (taken & ~done) === 0n &&
        seen.length === states.length &&
        states.every((state) => seen.some((other) => equal(state, other)))
      ) {
        return "covered";
      }
    }
    if ((this.#stored + 1) * this.#calls > this.#limit) {
      return "full";
    }
    bucket.push([done, states]);
    this.#configurations.set(name, bucket);
    this.#stored += 1;
    return "stored";
  }
}
