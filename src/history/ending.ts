// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * How the search of a partition for a linearization ends: its verdict, the
 * limit that stopped it, its frontier, and the error of a function of the
 * spec that threw.
 */

import type { Operation } from "./spec.js";

/** How a check or the search of a partition ended. */
export type Verdict = "passed" | "violated" | "undecided";

/** The limit that stopped an undecided search. */
export type Limit = "steps" | "memo" | "time";

/** How the search of one partition ended, and its frontier. */
export interface Ending<S> {
  /** The partition's verdict. */
  readonly outcome: Verdict;
  /** The steps that the search spent. */
  readonly steps: number;
  /** The positions of the frontier's calls, in order, for a search that did not pass. */
  readonly linearized: readonly number[];
  /** The frontier's states, or for a search that passed the states after the order it found. */
  readonly states: readonly S[];
  /** The positions of the calls that the spec rejected at the frontier. */
  readonly candidates: readonly number[];
  /** The limit that stopped an undecided search. */
  readonly limit: Limit | undefined;
}

/** A function of a spec that threw during a search, with the call that the search stepped. */
export class SpecError extends Error {
  /** The function: initial, next, equal or key. */
  readonly fn: string;
  /** The call that the search stepped, or undefined before the first step. */
  readonly call: number | undefined;
  /** The operation of that call, or undefined before the first step. */
  readonly operation: string | undefined;

  /**
   * Returns the error of a function of a spec that threw.
   *
   * @param fn - The function.
   * @param stepped - The call that the search stepped, as the record states it, or undefined.
   * @param cause - What the function threw.
   */
  constructor(
    fn: string,
    stepped: { readonly call: number; readonly operation: Operation } | undefined,
    cause: unknown,
  ) {
    const on =
      stepped === undefined ? "" : ` on ${JSON.stringify(stepped.operation.name)}`;
    super(`the spec's ${fn} throws${on}`, { cause });
    this.name = "SpecError";
    this.fn = fn;
    this.call = stepped?.call;
    this.operation = stepped?.operation.name;
  }
}
