// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The engine's body of a property: each case runs the property's body on a
 * case of the seat, inside the wrapper of the option around, and a run stops
 * between two cases once the signal of the seat aborts.
 */

import { Fault } from "../../matcher/fault.js";
import { type Seat, signalOf } from "../../matcher/seat.js";
import { own, type Slot } from "../../record/calls.js";
import { execute as executeCase } from "../case/execute.js";
import { Case, caseOf, type Location } from "../case.js";
import type { Body, Observer } from "../engine/execution.js";
import { drive, pending, type Work } from "../engine/work.js";
import type { Wrapper } from "../option.js";
import type { Call, PropertyBody } from "../property.js";

/** The option that states the wrapper of each run, the location of the wrapper's faults. */
const AROUND = "around";

/** The signal that a run stops at, between two cases, because the signal of its seat aborted. */
class Stopped extends Error {
  /**
   * Returns the signal of a run whose seat's signal aborted for reason.
   *
   * @param reason - The reason of the seat's signal.
   */
  constructor(reason: unknown) {
    super("the run stopped between two cases, because the seat's signal aborted", {
      cause: reason,
    });
    this.name = "Stopped";
  }
}

/**
 * Returns the work of a case that wrapper runs. The first call of run runs
 * work to its end, and the case ends as work ended, after the wrapper
 * settles. A second call of run runs nothing, and neither does a call after
 * the wrapper settled.
 *
 * @throws Fault at around for a wrapper that throws, one that returns
 *   without a call of run, and one that calls run a second time.
 */
function* wrapped(wrapper: Wrapper, work: Work<void>): Work<void> {
  let calls = 0;
  let settled = false;
  let ended = Promise.resolve<{ readonly error: unknown } | undefined>(undefined);
  const runOnce = (): Promise<void> => {
    calls += 1;
    if (calls > 1 || settled) {
      return Promise.resolve();
    }
    ended = drive(work).then(
      () => undefined,
      (error: unknown) => ({ error }),
    );
    return ended.then(() => undefined);
  };
  try {
    const returned = pending(wrapper(runOnce));
    if (returned !== undefined) {
      yield returned;
    }
  } catch (err) {
    throw new Fault(AROUND, "the wrapper threw", { cause: err });
  }
  settled = true;
  if (calls === 0) {
    throw new Fault(AROUND, "the wrapper returned without calling run");
  }
  if (calls > 1) {
    throw new Fault(AROUND, "the wrapper called run more than once");
  }
  const end = (yield ended) as { readonly error: unknown } | undefined;
  if (end !== undefined) {
    throw end.error;
  }
}

/**
 * Returns the observer that hands the calls of each case to slot, under the
 * case's phase.
 *
 * @param slot - The slot of the call of the property, or undefined.
 * @returns The observer.
 */
export function observerOf(slot: Slot | undefined): Observer {
  return (phase, execution) => slot?.take(own(caseOf(execution.case)), phase);
}

/**
 * Returns the engine's body that runs body on a case of seat inside around,
 * and stops the run once the seat's signal aborts.
 *
 * @param seat - The seat of the call.
 * @param slot - The slot of the call, or undefined.
 * @param body - The property's body.
 * @param call - The call of the property, whose call site locates the records of a case.
 * @param around - The wrapper of each run of the body, or undefined.
 * @returns The engine's body.
 */
export function adapt(
  seat: Seat,
  slot: Slot | undefined,
  body: PropertyBody,
  call: Call,
  around: Wrapper | undefined,
): Body {
  const signal = signalOf(seat);
  const location: Location = {
    site: call.where,
    pinned: call.pinned === true,
  };
  return (engine) => {
    if (signal.aborted) {
      throw new Stopped(signal.reason);
    }
    const work = executeCase(new Case(engine, seat, slot, location), body);
    return around === undefined ? work : wrapped(around, work);
  };
}
