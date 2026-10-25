// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The run of a property's body on its case: the body, the abort of the
 * case's signal, the cleanups, and how the case ended.
 */

import { Failure } from "../../failure.js";
import type { Case, Failing } from "../case.js";
import { Failed } from "../engine/case/signals.js";
import { TraceError } from "../engine/trace.js";
import { Diverged, Repeated } from "../engine/tree.js";
import { pending, type Work } from "../engine/work.js";
import { keyOf, ofError } from "../identity.js";
import { failedWith, isSignal, type State, stateOf } from "./state.js";

/** Keeps what a body or a cleanup threw: a signal, or the first raised value. */
function caught(state: State, err: unknown): void {
  if (isSignal(err)) {
    state.stopped ??= err;
  } else {
    state.raised ??= { value: err };
  }
}

/** Runs the cleanups of a case, the last registered first, each awaited when it returns a promise. */
function* cleanUp(state: State): Work<void> {
  for (let fn = state.cleanups.pop(); fn !== undefined; fn = state.cleanups.pop()) {
    try {
      const promise = pending(fn());
      if (promise !== undefined) {
        yield promise;
      }
    } catch (err) {
      caught(state, err);
    }
  }
}

/**
 * Returns the failure of a case that failed: its first record, or a record
 * of what it raised. A record of a raised value has no assertion, its
 * contract is the value's text, and its detail states the value's type and
 * its stack.
 */
function failureOf(state: State): Failed | undefined {
  const [first] = state.records;
  if (first !== undefined) {
    return failedWith(first);
  }
  if (state.raised === undefined) {
    return undefined;
  }
  const { value } = state.raised;
  const identity = ofError(value, state.location.site);
  const text = value instanceof Error ? value.message : String(value);
  const stack = value instanceof Error ? String(value.stack) : "";
  const failure = new Failure(
    "",
    text,
    { error: identity.error, stack },
    identity.where,
  );
  return new Failed(keyOf(identity), { failure, identity } satisfies Failing);
}

/**
 * Runs body on c as one case of a property, and ends the case: it aborts the
 * case's signal and runs its cleanups, then throws how the case ended. A case
 * that repeats a tested case, diverges, or follows a trace that it cannot
 * follow throws that signal. A case that failed, in the body or in a
 * cleanup, throws its failure, also when it was rejected, skipped or passed
 * its cap. A rejected case throws its rejection, a case that skipped throws
 * its skip, and a case that passed returns.
 *
 * @param c - The case.
 * @param body - The body, which may return a promise.
 * @returns The work of the case.
 */
export function* execute(c: Case, body: (c: Case) => unknown): Work<void> {
  const state = stateOf(c);
  try {
    const promise = pending(body(c));
    if (promise !== undefined) {
      yield promise;
    }
  } catch (err) {
    caught(state, err);
  }
  state.controller.abort(new DOMException("the case ended", "AbortError"));
  yield* cleanUp(state);
  const signal = state.stopped;
  if (
    signal instanceof Repeated ||
    signal instanceof Diverged ||
    signal instanceof TraceError
  ) {
    throw signal;
  }
  const failed = failureOf(state);
  if (failed !== undefined) {
    throw failed;
  }
  if (signal !== undefined) {
    throw signal;
  }
}
