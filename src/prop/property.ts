// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The run of a property: what forAll, fuzz and every property form share.
 *
 * A property takes its settings from its options and from the environment,
 * replays and keeps the failures of its store, and reports one record of
 * its assertion, prop-for-all or a form's id. The record's contract is the
 * property's, and its location is the call of the property. The calls of
 * each case of a run are recorded under the call of the property, with the
 * phase of the case.
 *
 * A property notes each fault that does not end its call, such as a file of
 * its store that it skips. A seat with reportFault receives the fault with
 * ending false, and any other seat through console.warn, which the test
 * runner shows beside the test.
 *
 * A run stops between two cases when the signal of its seat aborts, which
 * vitest does when the test times out, and then writes no store entry.
 *
 * A property with the option around runs each run of its body inside the
 * option's wrapper.
 */

import type { Where } from "../failure.js";
import { Fault, noteFault, ofOperation } from "../matcher/fault.js";
import { Mode, type Seat } from "../matcher/seat.js";
import type { Running } from "../matcher/verdict.js";
import type { Case } from "./case.js";
import { claim, type Loaded, load, storeOf } from "./directory.js";
import { Bridging } from "./engine/bridge.js";
import { campaign } from "./engine/campaign.js";
import type { Choice } from "./engine/choice.js";
import { execute } from "./engine/execution.js";
import { concludeCase, run, runStored } from "./engine/runner.js";
import type { Settings } from "./engine/settings.js";
import { type Outcome, Tally } from "./engine/tally.js";
import { type Entry, TraceError } from "./engine/trace.js";
import { drive, type Work } from "./engine/work.js";
import { budgetOf, seedOf } from "./environment.js";
import type { Config, Wrapper } from "./option.js";
import { adapt, observerOf } from "./property/body.js";
import { entriesOf, refusalOf, replayOf } from "./property/replay.js";
import { reportOutcome } from "./property/report.js";
import { saveOutcome, storeFaults } from "./property/store.js";
import { close } from "./registry.js";

/** The settings of a property's runs, with the cap on choices that every run states. */
type Stated = Settings & { readonly maxChoices: number };

/** Notes a fault of the call of op on seat that does not end the call. */
function note(seat: Seat, op: string, fault: Fault): void {
  noteFault(seat, ofOperation(op, fault));
}

/** A property's body: a function of its case, which may return a promise. */
export type PropertyBody = (c: Case) => unknown;

/** The call of a property: its operation, which names its faults, its assertion, its contract and its call site. */
export interface Call {
  /** The operation: prop.forAll, prop.fuzz, or a form's. */
  readonly op: string;
  /** The assertion of the call's record: prop-for-all, or a form's id. */
  readonly assertion: string;
  /** The property's contract. */
  readonly contract: string;
  /** The call site of the property. */
  readonly where: Where | undefined;
  /**
   * Whether every record of a case is at the call site of the property, as
   * a form's are: the library calls a form's assertion, so no frame of the
   * caller's code locates its record.
   */
  readonly pinned?: boolean;
}

/** The settings of a property's calls, its store and how it reports. */
export class Property {
  /** The call of the property. */
  readonly call: Call;
  /** The settings of the property's runs, without stored cases. */
  readonly #settings: Stated;
  /** The entries that the draws option states, or none. */
  readonly #entries: readonly Entry[];
  /** How long a campaign runs, in milliseconds, and 0 for a property that runs no campaign. */
  readonly #budget: number;
  /** The choices of the token that the property replays, or undefined. */
  readonly #replay: readonly Choice[] | undefined;
  /** The directory of the store, or the empty string for a property without one. */
  readonly #dir: string;
  /** The wrapper of each run of the body, or undefined. */
  readonly #around: Wrapper | undefined;

  private constructor(
    call: Call,
    settings: Stated,
    entries: readonly Entry[],
    budget: number,
    replay: readonly Choice[] | undefined,
    dir: string,
    around: Wrapper | undefined,
  ) {
    this.call = call;
    this.#settings = settings;
    this.#entries = entries;
    this.#budget = budget;
    this.#replay = replay;
    this.#dir = dir;
    this.#around = around;
  }

  /**
   * Returns the property of a call on seat under config, and closes the
   * registry, so a later registration throws. examples are the cases whose
   * values a property form states.
   *
   * @param seat - The seat of the call.
   * @param call - The call.
   * @param config - What the options of the call state.
   * @param examples - The cases of the examples, each its choices or its values.
   * @returns The property.
   * @throws Fault for a profile other than default, ci and campaign, a seed
   *   variable that is no decimal number below 2^64, a campaign's budget that
   *   is no whole number of seconds above 0, a token to replay that no
   *   encoder writes, and entries of the draws option that are no array of
   *   draw entries and step entries.
   */
  static of(
    seat: Seat,
    call: Call,
    config: Config,
    examples: Settings["examples"] = [],
  ): Property {
    close();
    const seed = seedOf(call.contract, config.seed, config.hermetic);
    const budget = budgetOf(config.hermetic);
    const entries = config.draws === undefined ? undefined : entriesOf(config.draws);
    const settings: Stated = {
      seed,
      cases: config.cases,
      maxChoices: config.maxChoices,
      requirements: config.requirements,
      traces: entries === undefined ? [] : [entries],
      examples,
      shrink: config.shrink,
      shrinkTime: config.shrinkTime,
      explain: config.explain,
    };
    return new Property(
      call,
      settings,
      entries ?? [],
      budget,
      replayOf(config),
      storeOf(seat, config.store),
      config.around,
    );
  }

  /**
   * Runs body as the property on seat, as the call running, and reports
   * the run: a replay of the token when the property replays one, a
   * campaign under the campaign profile, and a run otherwise. A
   * counterexample of a run writes an entry of each failure to the store,
   * and a campaign writes one of each failure as it concludes it.
   *
   * It ends the call with a fault for a second property of the test with
   * the same contract and store, a store that cannot be read or has a
   * damaged file, an entry of the draws option that the body cannot follow,
   * and a seat whose signal aborts before the run ends.
   *
   * @param seat - The seat of the call.
   * @param running - The call.
   * @param body - The body.
   * @returns A promise that settles when the call has reported.
   */
  async run(seat: Seat, running: Running, body: PropertyBody): Promise<void> {
    if (!this.#claim(seat, running)) {
      return;
    }
    const cases = adapt(seat, running.slot, body, this.call, this.#around);
    const observer = observerOf(running.slot);
    if (this.#replay !== undefined) {
      const replayed = run(
        cases,
        { ...this.#settings, replay: this.#replay },
        observer,
      );
      const outcome = await this.#drive(running, replayed);
      if (outcome !== undefined) {
        reportOutcome(running, this.call, outcome);
      }
      return;
    }
    const loaded = this.#load(running);
    if (loaded === undefined) {
      return;
    }
    const settings = {
      ...this.#settings,
      stored: loaded.entries.map((entry) => entry.choices),
    };
    const saved: Fault[] = [];
    const concluded = (found: Outcome): void => {
      saved.push(...saveOutcome(this.#dir, this.call.contract, found));
    };
    const work =
      this.#budget > 0
        ? campaign(cases, { ...settings, budget: this.#budget, concluded }, observer)
        : run(cases, settings, observer);
    const outcome = await this.#drive(running, work);
    if (outcome === undefined) {
      return;
    }
    if (outcome.kind === "counterexample" && this.#budget === 0) {
      concluded(outcome);
    }
    for (const fault of [...storeFaults(this.#dir, loaded, outcome), ...saved]) {
      note(seat, this.call.op, fault);
    }
    reportOutcome(running, this.call, outcome);
  }

  /**
   * Replays the stored cases of the property on seat, oldest first, as the
   * call running, and reports how they ended: a pass that counts them, or
   * the first that does not pass, as found. It notes each stored case that
   * decodes to other values than its entry records.
   *
   * It ends the call with a fault for each fault for which run ends its call
   * before a case.
   *
   * @param seat - The seat of the call.
   * @param running - The call.
   * @param body - The body.
   * @returns A promise that settles when the call has reported.
   */
  async replayStored(seat: Seat, running: Running, body: PropertyBody): Promise<void> {
    if (!this.#claim(seat, running)) {
      return;
    }
    const loaded = this.#load(running);
    if (loaded === undefined) {
      return;
    }
    const settings = {
      ...this.#settings,
      stored: loaded.entries.map((entry) => entry.choices),
    };
    const work = runStored(
      adapt(seat, running.slot, body, this.call, this.#around),
      settings,
      observerOf(running.slot),
    );
    const outcome = await this.#drive(running, work);
    if (outcome === undefined) {
      return;
    }
    for (const fault of storeFaults(this.#dir, loaded, outcome)) {
      note(seat, this.call.op, fault);
    }
    reportOutcome(running, this.call, outcome);
  }

  /**
   * Runs the case that the fuzz bridge decodes from data as a call of the
   * property on seat, as the call running, and reports it. A passing case
   * counts one valid or one rejected case, and a case that skips counts
   * none. A failing case is replayed, shrunk and explained as a run
   * concludes it, and the store keeps each failure of the counterexample.
   *
   * @param seat - The seat of the input's call.
   * @param running - The call.
   * @param body - The body.
   * @param data - The fuzzer's bytes.
   * @returns A promise that settles when the call has reported.
   */
  async input(
    seat: Seat,
    running: Running,
    body: PropertyBody,
    data: Uint8Array,
  ): Promise<void> {
    const cases = adapt(seat, running.slot, body, this.call, this.#around);
    const observer = observerOf(running.slot);
    const settings = this.#settings;
    function* bridged(): Work<Outcome> {
      const execution = yield* execute(cases, new Bridging(data), settings.maxChoices);
      observer("fuzz", execution);
      const tally = new Tally(settings.seed);
      const ended = tally.take(execution);
      if (ended?.kind !== "counterexample") {
        return ended ?? tally.outcome("passed");
      }
      return yield* concludeCase(cases, settings, execution, observer);
    }
    const outcome = await this.#drive(running, bridged());
    if (outcome === undefined) {
      return;
    }
    if (outcome.kind === "counterexample") {
      for (const fault of saveOutcome(this.#dir, this.call.contract, outcome)) {
        note(seat, this.call.op, fault);
      }
    }
    reportOutcome(running, this.call, outcome);
  }

  /**
   * Ends the call running of a property with a fault of its operation.
   *
   * @param running - The call.
   * @param call - The property's call.
   * @param err - The fault.
   */
  static fault(running: Running, call: Call, err: unknown): void {
    running.fault(Mode.Fatal, call.assertion, call.contract, ofOperation(call.op, err));
  }

  /** Ends the call running with a fault of the property's operation. */
  #fault(running: Running, err: unknown): void {
    Property.fault(running, this.call, err);
  }

  /** Claims the property's entries in its store, and ends the call with a fault when another property of the test has claimed them. */
  #claim(seat: Seat, running: Running): boolean {
    if (claim(seat, this.#dir, this.call.contract)) {
      return true;
    }
    const contract = JSON.stringify(this.call.contract);
    this.#fault(
      running,
      new Fault(
        this.#dir,
        `two properties of the test have the contract ${contract}, and would share their stored cases`,
      ),
    );
    return false;
  }

  /** Returns the entries of the store, or undefined after the call ended with a fault. */
  #load(running: Running): Loaded | undefined {
    if (this.#dir === "") {
      return { entries: [], skipped: [] };
    }
    try {
      return load(this.#dir, this.call.contract);
    } catch (err) {
      this.#fault(running, err);
      return undefined;
    }
  }

  /**
   * Drives work, and returns its outcome, or undefined after the call ended
   * with a fault: at the entry of the draws option that the body cannot
   * follow, and with any other error that ends the run, such as the stop of
   * a run whose seat's signal aborted.
   */
  async #drive(running: Running, work: Work<Outcome>): Promise<Outcome | undefined> {
    try {
      return await drive(work);
    } catch (err) {
      this.#fault(
        running,
        err instanceof TraceError ? refusalOf(err, this.#entries) : err,
      );
      return undefined;
    }
  }
}
