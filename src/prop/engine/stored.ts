// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The run of a stored case: its choices first, and the counterexample of its
 * entry as a trace when the choices decode to another counterexample.
 */

import { type Provider, Replaying } from "./case/providers.js";
import type { Choice } from "./choice.js";
import {
  type Body,
  type Execution,
  execute,
  type Observer,
  type Phase,
} from "./execution.js";
import { type Entry, TraceError, Tracing } from "./trace.js";
import type { Work } from "./work.js";

/**
 * A stored case: the choices of its entry, the counterexample of its entry
 * as a trace, and the test whether a case decodes to that counterexample.
 * The case of the choices counts when it fails, when matches is undefined,
 * and when matches reports true for it. After any other case of the choices,
 * the run follows the trace.
 */
export class Stored {
  /** The choices of the entry. */
  readonly choices: readonly Choice[];
  /** The entries of the counterexample of the entry, in request order. */
  readonly trace: readonly Entry[];
  /** Reports whether a case decodes to the counterexample of the entry, or undefined: the case of the choices then always counts. */
  readonly matches: ((execution: Execution) => boolean) | undefined;

  /**
   * Returns the stored case of an entry.
   *
   * @param choices - The choices of the entry.
   * @param trace - The counterexample of the entry, as a trace.
   * @param matches - Reports whether a case decodes to the counterexample.
   */
  constructor(
    choices: readonly Choice[],
    trace: readonly Entry[] = [],
    matches?: (execution: Execution) => boolean,
  ) {
    this.choices = choices;
    this.trace = trace;
    this.matches = matches;
  }
}

/** The run of a stored case, with the case that counts for it. */
export interface StoredRun {
  /** The case that counts: the case of the trace when replayed is true, and the case of the choices otherwise. */
  readonly execution: Execution;
  /** Whether the case of the trace counts. */
  readonly replayed: boolean;
  /** The refusal of an entry of the trace, or undefined. */
  readonly refusal: TraceError | undefined;
  /** The position of the first entry that the case of the trace left untaken, or undefined. */
  readonly untaken: number | undefined;
}

/**
 * Runs a stored case, and returns the case that counts for it. The case of
 * the choices counts when it fails or matches the entry. Any other case of
 * the choices gives way to the case of the trace. The case of the trace
 * counts when it fails and when it takes every entry. The case of the
 * choices counts when the body refuses an entry of the trace, and when the
 * case of the trace leaves an entry untaken. The observer receives the case
 * of the choices, and the case of the trace when that case counts. Both run
 * under the phase stored.
 *
 * @param body - The body.
 * @param stored - The stored case.
 * @param maxChoices - The most choices of a case.
 * @param observer - What sees the calls of the body.
 * @returns The work, which returns the run of the stored case.
 */
export function* runStoredCase(
  body: Body,
  stored: Stored,
  maxChoices: number,
  observer: Observer,
): Work<StoredRun> {
  const execution = yield* execute(body, new Replaying(stored.choices), maxChoices);
  observer("stored", execution);
  const { matches } = stored;
  const choices = {
    execution,
    replayed: false,
    refusal: undefined,
    untaken: undefined,
  };
  if (execution.status === "failed" || matches === undefined || matches(execution)) {
    return choices;
  }
  const tracing = new Tracing(stored.trace);
  let traced: Execution;
  try {
    traced = yield* execute(body, tracing, maxChoices);
  } catch (err) {
    if (err instanceof TraceError) {
      return { ...choices, refusal: err };
    }
    throw err;
  }
  if (traced.status !== "failed" && tracing.taken < stored.trace.length) {
    return { ...choices, untaken: tracing.taken };
  }
  observer("stored", traced);
  return { ...choices, execution: traced, replayed: true };
}

/**
 * Runs one case that a run tries before it generates any, and returns the
 * execution that counts for it: a stored case runs as runStoredCase runs
 * it, and stored receives its run, and every other case runs under its
 * phase.
 *
 * @param body - The body.
 * @param phase - The phase of the case.
 * @param provider - The provider of the case, or the stored case.
 * @param maxChoices - The most choices of a case.
 * @param observer - What sees the calls of the body.
 * @param stored - The runs of the stored cases so far, which the run of a stored case joins.
 * @returns The work, which returns the execution.
 */
export function* runKnown(
  body: Body,
  phase: Phase,
  provider: Provider | Stored,
  maxChoices: number,
  observer: Observer,
  stored: StoredRun[],
): Work<Execution> {
  if (provider instanceof Stored) {
    const ran = yield* runStoredCase(body, provider, maxChoices, observer);
    stored.push(ran);
    return ran.execution;
  }
  const execution = yield* execute(body, provider, maxChoices);
  observer(phase, execution);
  return execution;
}
