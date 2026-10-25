// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertion that an assertion can fail.
 *
 * This is what an assertion library has to be able to say about
 * itself, and what any check meant to refuse bad input needs: not that
 * it passes, but that it fails when it should.
 */

import { callSite, type Failure } from "./failure.js";
import { Body, Ended, runOn } from "./matcher/body.js";
import { track } from "./matcher/pending.js";
import { Mode, type Reporter, type Seat } from "./matcher/seat.js";
import { Running } from "./matcher/verdict.js";
import { own } from "./record/calls.js";

/**
 * The seat of the check that rejects drives. It keeps each record of the
 * check in call order, whether the check failed at all, and the fault that
 * ended the check. A failure that stops ends the check, as it ends a test,
 * and so does a fault that ends its call.
 */
class Check extends Body implements Reporter {
  readonly #records: Failure[] = [];
  #failed = false;
  #fault: Error | undefined;

  /** Marks the check failed, and ends it. */
  fail(): never {
    this.#failed = true;
    throw new Ended();
  }

  /** Marks the check failed. */
  record(): void {
    this.#failed = true;
  }

  /** Keeps failure, and ends the check when it came from the aborting surface. */
  report(failure: Failure, aborting: boolean): void {
    this.#failed = true;
    this.#records.push(failure);
    if (aborting) {
      throw new Ended();
    }
  }

  /**
   * Keeps a fault that ends its call, and ends the check. A noted fault
   * goes to the seat of rejects, and the check runs on.
   *
   * @param fault - The fault.
   * @param ending - Whether the fault ends its call.
   */
  override reportFault(fault: Error, ending: boolean): void {
    if (!ending) {
      super.reportFault(fault, ending);
      return;
    }
    this.#fault = fault;
    throw new Ended();
  }

  /** The check's records, whether it failed, and the fault that ended it. */
  get outcome(): {
    readonly records: readonly Failure[];
    readonly failed: boolean;
    readonly fault: Error | undefined;
  } {
    return { records: [...this.#records], failed: this.#failed, fault: this.#fault };
  }
}

/** Runs body as the check of a call of rejects, and reports when it passes. */
async function drive(
  seat: Seat,
  msg: string,
  body: (check: Seat) => unknown,
): Promise<readonly Failure[]> {
  const call = Running.begin(seat, callSite());
  const check = await runOn(new Check(seat, call.slot), body);
  call.slot?.take(own(check));
  const { records, failed, fault } = check.outcome;
  if (fault !== undefined) {
    call.fault(Mode.Fatal, "rejects", msg, fault);
    return [];
  }
  if (!failed) {
    call.fail(Mode.Fatal, "rejects", msg, {});
    return records;
  }
  call.pass(Mode.Fatal, "rejects", msg);
  return records;
}

/**
 * Fail when the check does not fail.
 *
 * body receives a seat of its own, which keeps every record of the check
 * and ends the check at its first failure that stops, as a failure ends a
 * test. A message passed straight to that seat's `fail` or `record`
 * fails the check without a record. The calls of the check are recorded
 * under the call of rejects. The seat's signal derives from the signal of
 * seat, and aborts when the check ends.
 *
 * A fault that ends the check ends the call of rejects with the same
 * fault, because the check did not decide about the implementation. A
 * fault of this library ends a check this way, and so does one that a
 * helper passes to `fault`. The call record of rejects states the verdict
 * error, and rejects passes the fault to seat as `fault` passes it. The
 * promise then resolves to no record on a seat with reportFault, and
 * rejects with the fault on any other seat. A fault that the check notes
 * goes to seat as a noted fault, and the check runs on.
 *
 * @param seat - Where the failure is reported.
 * @param msg - The contract under test.
 * @param body - The check, which may return a promise; expected to fail.
 * @returns The failure records of the check, in call order.
 * @example
 * const failures = await check.doesReject(seat, "an empty name is refused", (inner) => {
 *   check.isNil(inner, validate(""), "it passes");
 * });
 */
export function doesReject(
  seat: Seat,
  msg: string,
  body: (check: Seat) => unknown,
): Promise<readonly Failure[]> {
  seat.helper();
  return track(seat, msg, drive(seat, msg, body));
}
