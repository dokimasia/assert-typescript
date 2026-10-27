// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The case of a property's body: one call of the body, and the seat that
 * the body's assertions report to.
 *
 * A case keeps each failure record in call order, and its first record is
 * the case's failure. A failure that stops ends the case with a signal of
 * the engine, as an aborting assertion ends a test. assume, skip, a draw
 * that repeats a tested case and a draw past the cap end it with a signal
 * too.
 * Every later call of the case throws the signal again, so a body that
 * catches a signal cannot run on past the end of its case.
 *
 * When the body ends, however it ends, the case aborts its signal and runs
 * its cleanups, the last registered first. A cleanup is part of the case: a
 * failure in it fails the case as one in the body does, the later cleanups
 * still run, and a draw in it is a draw of the case.
 */

import type { Clock } from "../clock.js";
import { Failure, type Where } from "../failure.js";
import { History } from "../history/history.js";
import { noteFault } from "../matcher/fault.js";
import { clockOf, type Reporter, type Seat, signalOf } from "../matcher/seat.js";
import { own, run, type Slot } from "../record/calls.js";
import { Standard } from "../seat.js";
import {
  CASES,
  check,
  Faulted,
  failedWith,
  isFinal,
  locate,
  STATES,
  stateOf,
  stop,
} from "./case/state.js";
import { Rejected, Skipped } from "./engine/case/signals.js";
import type { Case as Engine } from "./engine/case.js";
import type { Generator } from "./engine/generator.js";
import type { Identity } from "./identity.js";

/** What a failed case failed with: its record, and the identity that the shrinker keeps it by. */
export interface Failing {
  /** The case's failure record. */
  readonly failure: Failure;
  /** The failure's identity. */
  readonly identity: Identity;
}

/** Where the records of a case are. */
export interface Location {
  /** The call site of the property: the location of a record whose stack names no frame of the caller's code. */
  readonly site: Where | undefined;
  /**
   * Whether every record of the case is at the call site of the property,
   * as the records of a property form's assertion are, which the library
   * calls.
   */
  readonly pinned: boolean;
}

/**
 * One call of a property's body. The body's assertions report to the case,
 * and its draws decode the body's inputs from the case's choices. A case is
 * a seat, a reporter of failure records and a seat with cleanups, so every
 * assertion of this library works on it.
 */
export class Case implements Seat, Reporter {
  /** Aborts when the body ends, before the cleanups run, and when the signal of the property's seat aborts. */
  readonly signal: AbortSignal;

  /**
   * Returns the case of one call of a body. The property's run constructs
   * each case.
   *
   * @param engine - The engine's record of the call.
   * @param seat - The seat of the property.
   * @param slot - The slot of the property's call, which records the calls
   *   of the case, or undefined when the call is not recorded.
   * @param location - Where the records of the case are.
   */
  constructor(engine: Engine, seat: Seat, slot: Slot | undefined, location: Location) {
    const controller = new AbortController();
    this.signal = AbortSignal.any([signalOf(seat), controller.signal]);
    STATES.set(this, {
      engine,
      seat,
      controller,
      location,
      records: [],
      raised: undefined,
      stopped: undefined,
      cleanups: [],
      history: undefined,
    });
    CASES.set(engine, this);
    run(own(this), slot);
  }

  /** Marks the calling function as a helper, which a case does not track. */
  helper(): void {
    // A case's records state the frame of their own calls.
  }

  /**
   * Keeps a record without an assertion, whose contract is the message and
   * whose location is the innermost frame of the caller's code, and ends the
   * case.
   *
   * @param message - What failed.
   */
  fail(message: string): never {
    const state = stateOf(this);
    check(state);
    state.records.push(new Failure("", message, {}, locate(state.location)));
    stop(state, failedWith(state.records[0] as Failure));
  }

  /**
   * Keeps a record without an assertion, whose contract is the message and
   * whose location is the innermost frame of the caller's code. The body
   * runs on, and the case fails when it ends.
   *
   * @param message - What failed.
   */
  record(message: string): void {
    const state = stateOf(this);
    check(state);
    state.records.push(new Failure("", message, {}, locate(state.location)));
  }

  /**
   * Keeps an assertion's failure record. An aborting record ends the case.
   * A recording record lets the body run on, and the case fails when it
   * ends. A case whose records are pinned keeps the record at the call site
   * of the property.
   *
   * @param failure - The record.
   * @param aborting - Whether the assertion stops at its failure.
   */
  report(failure: Failure, aborting: boolean): void {
    const state = stateOf(this);
    check(state);
    const { pinned, site } = state.location;
    state.records.push(
      pinned
        ? new Failure(failure.assertion, failure.contract, failure.detail, site)
        : failure,
    );
    if (aborting) {
      stop(state, failedWith(state.records[0] as Failure));
    }
  }

  /** Returns the clock of the property's seat, so every case runs under the test's clock. */
  clock(): Clock {
    return clockOf(stateOf(this).seat);
  }

  /**
   * Returns a value of generator and records it under label for the
   * counterexample. Two draws may share a label. A draw ends the case when
   * the case repeats a tested case, when the body requested other choices
   * after the same values in an earlier case, and when the case passes its
   * cap on choices.
   *
   * @param generator - The generator.
   * @param label - The draw's label.
   * @returns The value.
   */
  draw<T>(generator: Generator<T>, label: string): T {
    const state = stateOf(this);
    check(state);
    try {
      return state.engine.draw(generator, label);
    } catch (err) {
      stop(state, err);
    }
  }

  /**
   * Rejects the case when condition is false, which ends it. A rejected case
   * is not counted, is not shrunk, and does not fail the property. A run
   * that rejects more than ten cases for every valid one fails as rejected.
   *
   * @param condition - The condition.
   */
  assume(condition: boolean): void {
    const state = stateOf(this);
    check(state);
    if (!condition) {
      stop(state, new Rejected());
    }
  }

  /**
   * Ends the run of the property as skipped, with reason. The case ends at
   * the call and runs its cleanups. Once the run has found a failing case, a
   * case that skips ends as a case that does not fail, and the run goes on.
   *
   * The seat of the fixture of `@dokimi/assert/vitest` skips its test with
   * reason. On every other seat, the seat of a jest test included, the test
   * passes, and the call record of the property states the verdict skip.
   *
   * @param reason - Why the case skips, such as a capability that the
   *   environment lacks.
   * @example
   * test("writes with direct I/O", async ({ seat }) => {
   *   await prop.forAll(seat, "a write reads back", (c) => {
   *     if (!supportsDirectIo()) c.skip("the file system refuses direct I/O");
   *     // ...
   *   });
   * });
   */
  skip(reason: string): never {
    const state = stateOf(this);
    check(state);
    stop(state, new Skipped(reason));
  }

  /**
   * Receives a fault of a call of the body. A fault that ends its call ends
   * the case, also after a failure. The run of the property then ends in
   * every phase, and the property ends its call with the same fault. A noted
   * fault passes to the seat of the property, and the body runs on.
   *
   * @param fault - The fault.
   * @param ending - Whether the fault ends its call.
   */
  reportFault(fault: Error, ending: boolean): void {
    const state = stateOf(this);
    if (!ending) {
      noteFault(state.seat, fault);
      return;
    }
    if (isFinal(state.stopped)) {
      throw state.stopped;
    }
    state.stopped = new Faulted(fault);
    throw state.stopped;
  }

  /**
   * Counts the case under label, for the coverage requirements that
   * prop.require states. A label counted twice in one case counts once.
   *
   * @param label - The label.
   */
  classify(label: string): void {
    const state = stateOf(this);
    check(state);
    state.engine.classify(label);
  }

  /**
   * Attaches message to the case. Only a failing case reports its notes.
   *
   * @param message - The note.
   */
  note(message: string): void {
    const state = stateOf(this);
    check(state);
    state.engine.note(message);
  }

  /**
   * Returns a source of random values whose every value is an integer choice
   * of the case over the whole unsigned 64-bit range, so randomised code
   * under test replays and shrinks without change. A value of the source
   * requests an input, as a draw does.
   *
   * @returns The source: each call returns the next value.
   */
  rand(): () => bigint {
    return () => {
      const state = stateOf(this);
      check(state);
      try {
        return state.engine.random();
      } catch (err) {
        stop(state, err);
      }
    };
  }

  /**
   * Records a fingerprint of the subject's state at this point. A replay of
   * the case compares its fingerprints with the recorded ones, and a run
   * whose replay records another fingerprint, or another number of them,
   * ends as flaky.
   *
   * @param fingerprint - The fingerprint.
   */
  observe(fingerprint: bigint): void {
    const state = stateOf(this);
    check(state);
    state.engine.observe(fingerprint);
  }

  /**
   * Registers fn to run when the case ends: after its body returns, fails,
   * throws, rejects the case, skips or stops at a draw. The cleanups run the
   * last registered first, and each that returns a promise is awaited. A
   * failure in a cleanup fails the case as one in the body does, and the
   * later cleanups still run. A cleanup that a cleanup registers runs before
   * the case ends.
   *
   * @param fn - The cleanup.
   */
  cleanup(fn: () => void | Promise<void>): void {
    stateOf(this).cleanups.push(fn);
  }

  /**
   * Returns the case's history, which records the calls that the body makes
   * to a subject, for a check of history or a machine of stateful. It is
   * empty when the case starts, and every call returns the same history.
   *
   * @returns The history.
   */
  history(): History {
    const state = stateOf(this);
    check(state);
    state.history ??= new History();
    return state.history;
  }

  /**
   * Records score as a score that the case achieved under label. A case that
   * records two scores under one label keeps the higher. A campaign explores
   * near the cases with the highest score of each label, and every other run
   * records the score and generates as if it were absent.
   *
   * @param label - The label.
   * @param score - The score.
   */
  target(label: string, score: number): void {
    const state = stateOf(this);
    check(state);
    state.engine.target(label, score);
  }
}

/**
 * Calls fn with the engine's record of c, as a draw of c calls the engine:
 * it throws the signal that ended the case, and keeps a signal that fn
 * throws as the signal that ends the case. The steps of a machine and the
 * task scheduler make their choices this way.
 *
 * @param c - The case.
 * @param fn - What to do on the engine's record.
 * @returns What fn returns.
 * @throws The signal that ended the case, and what fn throws.
 */
export function onEngine<T>(c: Case, fn: (engine: Engine) => T): T {
  const state = stateOf(c);
  check(state);
  try {
    return fn(state.engine);
  } catch (err) {
    stop(state, err);
  }
}

/**
 * Returns the case of an engine case, and a case of a seat that throws for
 * an engine case that no body runs on, such as one that the explain phase
 * decodes a filling on.
 *
 * @param engine - The engine case.
 * @returns The case.
 */
export function caseOf(engine: Engine): Case {
  const location: Location = { site: undefined, pinned: false };
  return CASES.get(engine) ?? new Case(engine, new Standard(), undefined, location);
}
