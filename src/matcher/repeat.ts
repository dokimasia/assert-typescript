// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The steps of a relation: a step that may throw or reject, and the
 * comparison of the results of two steps or of repeated steps.
 */

import { equal as compare } from "./compare.js";
import type { Relaxations } from "./option.js";
import type { Mode } from "./seat.js";
import type { Running } from "./verdict.js";

/**
 * How many times `isDeterministic` calls its subject, `hasStableOrder`
 * iterates it and `isPoisoned` reads it. A subject whose results vary can
 * agree with itself by chance in fewer runs.
 */
export const REPETITIONS = 32;

/** What a step returned, or what it threw or rejected with. */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly thrown: unknown };

/** Runs step, and returns its value or what it threw or rejected with. */
export async function attempt<T>(step: () => T | Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await step() };
  } catch (thrown) {
    return { ok: false, thrown };
  }
}

/**
 * Returns the detail of a failure of the step at index i of a relation
 * that compares first and second: the failure is first for the first step,
 * and second for every later one.
 */
export function failedAt(i: number, thrown: unknown): Record<string, unknown> {
  return i === 0 ? { first: thrown, second: null } : { first: null, second: thrown };
}

/**
 * Runs first, then second, and reports the first of them that fails, or a
 * failure of both values when they differ under relax.
 */
export async function settle(
  run: Running,
  mode: Mode,
  assertion: string,
  msg: string,
  first: () => unknown,
  second: () => unknown,
  relax: Relaxations,
): Promise<void> {
  const a = await attempt(first);
  if (!a.ok) {
    run.fail(mode, assertion, msg, failedAt(0, a.thrown));
    return;
  }
  const b = await attempt(second);
  if (!b.ok) {
    run.fail(mode, assertion, msg, failedAt(1, b.thrown));
    return;
  }
  if (!compare(b.value, a.value, relax)) {
    run.fail(mode, assertion, msg, { first: a.value, second: b.value });
    return;
  }
  run.pass(mode, assertion, msg);
}

/**
 * Runs produce REPETITIONS times, and reports the first result that
 * differs from the first result under relax, or the first run that fails.
 */
export async function agree(
  run: Running,
  mode: Mode,
  assertion: string,
  msg: string,
  produce: () => unknown,
  relax: Relaxations,
): Promise<void> {
  let first: unknown;
  for (let i = 0; i < REPETITIONS; i += 1) {
    const next = await attempt(produce);
    if (!next.ok) {
      run.fail(mode, assertion, msg, failedAt(i, next.thrown));
      return;
    }
    if (i === 0) {
      first = next.value;
    } else if (!compare(next.value, first, relax)) {
      run.fail(mode, assertion, msg, { first, second: next.value });
      return;
    }
  }
  run.pass(mode, assertion, msg);
}
