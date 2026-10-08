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
 * check in call order, and whether the check failed at all. A failure
 * that stops ends the check, as it ends a test.
 */
class Check extends Body implements Reporter {
  #records: Failure[] = [];
  #failed = false;

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
    if (aborting) throw new Ended();
  }

  /** The check's records, and whether it failed. */
  get outcome(): { readonly records: readonly Failure[]; readonly failed: boolean } {
    return { records: [...this.#records], failed: this.#failed };
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
  const { records, failed } = check.outcome;
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
 * @param seat - Where the failure is reported.
 * @param msg - The contract under test.
 * @param body - The check, which may return a promise; expected to fail.
 * @returns The failure records of the check, in call order.
 * @example
 * const failures = await check.rejects(seat, "an empty name is refused", (inner) => {
 *   check.isNil(inner, validate(""), "it passes");
 * });
 */
export function rejects(
  seat: Seat,
  msg: string,
  body: (check: Seat) => unknown,
): Promise<readonly Failure[]> {
  seat.helper();
  return track(seat, msg, drive(seat, msg, body));
}
