// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The state of the case of a property's body, which only the property's run
 * reads: its records, the signal that ended it, what it raised, and its
 * cleanups.
 */

import { callSite, type Failure, type Where } from "../../failure.js";
import type { History } from "../../history/history.js";
import { faultText } from "../../matcher/fault.js";
import type { Seat } from "../../matcher/seat.js";
import type { Case, Failing, Location } from "../case.js";
import { Failed, Rejected, Skipped } from "../engine/case/signals.js";
import type { Case as Engine } from "../engine/case.js";
import { TraceError } from "../engine/trace.js";
import { Diverged, Repeated } from "../engine/tree.js";
import { keyOf, ofRecord } from "../identity.js";

/** The state of a case that only the property's run reads. */
export interface State {
  readonly engine: Engine;
  readonly seat: Seat;
  readonly controller: AbortController;
  readonly location: Location;
  readonly records: Failure[];
  raised: { readonly value: unknown } | undefined;
  stopped: unknown;
  readonly cleanups: (() => unknown)[];
  history: History | undefined;
}

/** The state of each case. */
export const STATES = new WeakMap<Case, State>();

/** The case of each engine case that a property's body runs on. */
export const CASES = new WeakMap<Engine, Case>();

/** Returns the state of c. */
export function stateOf(c: Case): State {
  return STATES.get(c) as State;
}

/**
 * The signal of a case that a fault of a call of its body ended. The fault
 * ends the run of the property in every phase, and the property ends its
 * call with the same fault.
 */
export class Faulted extends Error {
  /** The fault. */
  readonly fault: unknown;

  /**
   * Returns the signal of a fault of a call of the body.
   *
   * @param fault - The fault.
   */
  constructor(fault: unknown) {
    super(faultText(fault));
    this.name = "Faulted";
    this.fault = fault;
  }
}

/** Reports whether err is a signal of the engine, which ends the case. */
export function isSignal(err: unknown): boolean {
  return (
    err instanceof Rejected ||
    err instanceof Failed ||
    err instanceof Skipped ||
    err instanceof Faulted ||
    isFinal(err)
  );
}

/**
 * Reports whether err is a signal that ends the run as well as the case: a
 * repeat of a tested case, a divergence, an entry that a trace cannot follow,
 * and a fault of a call of the body.
 */
export function isFinal(err: unknown): boolean {
  return (
    err instanceof Repeated ||
    err instanceof Diverged ||
    err instanceof TraceError ||
    err instanceof Faulted
  );
}

/** Throws the signal that ended the case, when one did. */
export function check(state: State): void {
  if (state.stopped !== undefined) {
    throw state.stopped;
  }
}

/** Keeps err as the signal that ended the case when it is one, and throws it. */
export function stop(state: State, err: unknown): never {
  if (isSignal(err)) {
    state.stopped ??= err;
  }
  throw err;
}

/** Returns the location of a record that the case's caller makes: the innermost frame of the caller's code, or the property's call site. */
export function locate(location: Location): Where | undefined {
  return location.pinned ? location.site : (callSite() ?? location.site);
}

/** Returns the failure of a case whose first record is failure. */
export function failedWith(failure: Failure): Failed {
  const identity = ofRecord(failure);
  return new Failed(keyOf(identity), { failure, identity } satisfies Failing);
}
