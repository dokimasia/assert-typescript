// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The relations of what a subject refuses: a domain that it accepts in
 * full, a call that a closed subject refuses with a sentinel, and the
 * readings that a poisoned subject refuses. failsAfterClose and isPoisoned
 * require a throw or a rejection of the call that they examine.
 */

import { callSite } from "../failure.js";
import { matchesTarget } from "./errors.js";
import { attempt, REPETITIONS } from "./repeat.js";
import type { Mode, Seat } from "./seat.js";
import { Running } from "./verdict.js";

/**
 * Fail at the first element of domain, in order, for which call throws or
 * rejects. index is its position, and got what call threw. An empty domain
 * passes.
 */
export async function isTotal<I>(
  seat: Seat,
  mode: Mode,
  call: (input: I) => unknown,
  domain: Iterable<I>,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  for (const [index, element] of [...domain].entries()) {
    const outcome = await attempt(() => call(element));
    if (!outcome.ok) {
      run.fail(mode, "total", msg, { index, got: outcome.thrown });
      return;
    }
  }
  run.pass(mode, "total", msg);
}

/**
 * Fail when call, after close, does not throw or reject with sentinel,
 * through the chain of causes. want is sentinel, and got what call threw,
 * or null when it returned. A throw of close fails with want null and got
 * what it threw.
 */
export async function failsAfterClose(
  seat: Seat,
  mode: Mode,
  close: () => unknown,
  call: () => unknown,
  sentinel: unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const closed = await attempt(close);
  if (!closed.ok) {
    run.fail(mode, "after-close", msg, { want: null, got: closed.thrown });
    return;
  }
  const used = await attempt(call);
  if (used.ok || !matchesTarget(used.thrown, sentinel)) {
    run.fail(mode, "after-close", msg, {
      want: sentinel,
      got: used.ok ? null : used.thrown,
    });
    return;
  }
  run.pass(mode, "after-close", msg);
}

/**
 * Fail when, after induce, one of 32 readings of observe returns rather
 * than throws or rejects. index is the position of that reading, and got
 * what it returned. A throw of induce fails with index null and got what
 * it threw.
 */
export async function isPoisoned(
  seat: Seat,
  mode: Mode,
  induce: () => unknown,
  observe: () => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const induced = await attempt(induce);
  if (!induced.ok) {
    run.fail(mode, "poisoned", msg, { index: null, got: induced.thrown });
    return;
  }
  for (let index = 0; index < REPETITIONS; index += 1) {
    const reading = await attempt(observe);
    if (reading.ok) {
      run.fail(mode, "poisoned", msg, { index, got: reading.value });
      return;
    }
  }
  run.pass(mode, "poisoned", msg);
}
