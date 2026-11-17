// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The entries of the search of one partition: the invocation of each call,
 * and the completion of each known call, in event order. A call that is not
 * known has no completion entry.
 *
 * The entries form a doubly linked list between a head and a tail, so the
 * search takes the entries of a linearized call out of the scan and puts
 * them back in constant time. The head and the tail are the first two
 * entries, so the entries of new calls append without moving an entry.
 */

import type { Checked } from "./partition.js";

/** The entries of the head and the tail. */
const HEAD = 0;
const TAIL = 1;

/** The entries of the calls of one partition. */
export class Entries {
  /** The next and the previous entry of each entry. */
  readonly #next: number[] = [TAIL, TAIL];
  readonly #prev: number[] = [HEAD, HEAD];
  /** The position of the call of each entry, and whether the entry is an invocation. */
  readonly #position: number[] = [-1, -1];
  readonly #invokes: boolean[] = [false, false];
  /** The entry of each call's invocation, and of a known call's completion. */
  readonly #invocation: number[] = [];
  readonly #completion: (number | undefined)[] = [];
  /** The set of calls without a completion entry, a bit per position. */
  #optional = 0n;
  /** The number of known calls whose entries are in the scan. */
  #open = 0;

  /** The set of calls without a completion entry, a bit per position. */
  get optional(): bigint {
    return this.#optional;
  }

  /** The number of known calls whose entries are in the scan. */
  get open(): number {
    return this.#open;
  }

  /** The first entry of the scan, which is the tail when no entry is in it. */
  get first(): number {
    return this.#next[HEAD] as number;
  }

  /**
   * Adds the entries of calls after the entries of the calls before them,
   * in event order. The calls follow every event of the calls before them.
   * An entry that is out of the scan while the tail follows it then points
   * at the first new entry, so its call comes back into the scan before the
   * new entries.
   *
   * @param calls - The new calls, in event order.
   * @param start - The position of the first new call.
   */
  add(calls: readonly Checked[], start: number): void {
    if (calls.length === 0) {
      return;
    }
    const entries: [event: number, position: number, invokes: boolean][] = [];
    calls.forEach(({ span }, offset) => {
      const position = start + offset;
      entries.push([span.call, position, true]);
      if (span.operation.known) {
        entries.push([span.completion as number, position, false]);
      } else {
        this.#optional |= 1n << BigInt(position);
      }
      this.#invocation.push(0);
      this.#completion.push(undefined);
    });
    entries.sort(([a], [b]) => a - b);
    const first = this.#next.length;
    for (let entry = TAIL + 1; entry < first; entry += 1) {
      if (this.#next[entry] === TAIL) {
        this.#next[entry] = first;
      }
    }
    let last = this.#prev[TAIL] as number;
    for (const [, position, invokes] of entries) {
      const entry = this.#next.length;
      this.#next[last] = entry;
      this.#prev.push(last);
      this.#next.push(TAIL);
      this.#position.push(position);
      this.#invokes.push(invokes);
      if (invokes) {
        this.#invocation[position] = entry;
      } else {
        this.#completion[position] = entry;
        this.#open += 1;
      }
      last = entry;
    }
    this.#prev[TAIL] = last;
  }

  /**
   * Returns the entry after entry in the scan.
   *
   * @param entry - The entry.
   * @returns The next entry, or the tail.
   */
  next(entry: number): number {
    return this.#next[entry] as number;
  }

  /**
   * Reports whether entry is an invocation.
   *
   * @param entry - The entry.
   * @returns True for an invocation, and false for a completion and the tail.
   */
  invokes(entry: number): boolean {
    return this.#invokes[entry] as boolean;
  }

  /**
   * Returns the position of the call of entry.
   *
   * @param entry - The entry of an invocation or a completion.
   * @returns The position of its call in the partition.
   */
  position(entry: number): number {
    return this.#position[entry] as number;
  }

  /**
   * Returns the entry after the invocation of the call at position.
   *
   * @param position - The position of a call in the partition.
   * @returns The entry.
   */
  afterInvocation(position: number): number {
    return this.#next[this.#invocation[position] as number] as number;
  }

  /**
   * Takes the entries of the call at position out of the scan.
   *
   * @param position - The position of a call whose entries are in the scan.
   */
  lift(position: number): void {
    this.#unlink(this.#invocation[position] as number);
    const completion = this.#completion[position];
    if (completion !== undefined) {
      this.#unlink(completion);
      this.#open -= 1;
    }
  }

  /**
   * Puts the entries of the call at position back into the scan, in the
   * reverse order of lift.
   *
   * @param position - The position of the call that lift took out last.
   */
  unlift(position: number): void {
    const completion = this.#completion[position];
    if (completion !== undefined) {
      this.#relink(completion);
      this.#open += 1;
    }
    this.#relink(this.#invocation[position] as number);
  }

  /** Takes one entry out of the list. */
  #unlink(entry: number): void {
    const before = this.#prev[entry] as number;
    const after = this.#next[entry] as number;
    this.#next[before] = after;
    this.#prev[after] = before;
  }

  /** Puts back an entry that unlink took out, between its old neighbours. */
  #relink(entry: number): void {
    this.#next[this.#prev[entry] as number] = entry;
    this.#prev[this.#next[entry] as number] = entry;
  }
}
