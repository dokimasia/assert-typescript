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
 * its store that it skips, through console.warn. The test runner shows the
 * note beside the test.
 *
 * A run stops between two cases when the signal of its seat aborts, which
 * vitest does when the test times out, and then writes no store entry.
 */

import { join } from "node:path";
import type { Where } from "../failure.js";
import { Fault, ofOperation } from "../matcher/fault.js";
import { Mode, type Seat, signalOf } from "../matcher/seat.js";
import type { Running } from "../matcher/verdict.js";
import { own, type Slot } from "../record/calls.js";
import { Case, caseOf, execute as executeCase, type Location } from "./case.js";
import { detailJson, detailOf, recordOf } from "./detail.js";
import { claim, type Loaded, load, type Stored, save, storeOf } from "./directory.js";
import { Bridging } from "./engine/bridge.js";
import { campaign } from "./engine/campaign.js";
import type { Step } from "./engine/case.js";
import type { Choice } from "./engine/choice.js";
import {
  type Body,
  type Execution,
  execute,
  type Observer,
} from "./engine/execution.js";
import * as literal from "./engine/literal.js";
import {
  concludeCase,
  type Outcome,
  run,
  runStored,
  type Settings,
  Tally,
} from "./engine/runner.js";
import * as token from "./engine/token.js";
import { type Entry, isStep, TraceError } from "./engine/trace.js";
import { drive, type Work } from "./engine/work.js";
import { budgetOf, mutated, seedOf, tokenOf } from "./environment.js";
import type { Config } from "./option.js";
import { close } from "./registry.js";
import { differs, entryOf } from "./stored.js";

/** The option that states the entries of a case, at the front of the location of a fault in them. */
const DRAWS = "draws";

/** A property's body: a function of its case, which may return a promise. */
export type PropertyBody = (c: Case) => unknown;

/** The settings of a property's runs, with the cap on choices that every run states. */
type Stated = Settings & { readonly maxChoices: number };

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

/** Reports whether value is a JSON object. */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the step entry that an entry of the draws option states. */
function stepOf(entry: Readonly<Record<string, unknown>>, at: string): Step {
  const client = entry["client"];
  if (
    client !== undefined &&
    !(Number.isSafeInteger(client) && (client as number) >= 0)
  ) {
    throw new Fault(
      `${at}.client`,
      `the client ${JSON.stringify(client)} is no whole number of 0 or more`,
    );
  }
  return {
    action: entry["step"] as string,
    ...(client === undefined ? {} : { client: client as number }),
    ...(entry["drain"] === true ? { drain: true } : {}),
  };
}

/**
 * Returns the entries of a case that the draws option states: a JSON array
 * of objects, each a step entry, which states the action of a step under
 * step, its client under client and the drain mark as drain: true, or a
 * draw entry, which states a label and a typed literal.
 *
 * @throws Fault at draws for text that is no array of objects, and at an
 *   entry that states no step and no label or no value, a client that is
 *   no whole number of 0 or more, and a value that is no typed literal.
 */
function entriesOf(text: string): Entry[] {
  let stated: unknown;
  try {
    stated = JSON.parse(text);
  } catch (err) {
    throw new Fault(DRAWS, "the entries are no JSON array of objects", err);
  }
  if (!Array.isArray(stated) || !stated.every(isObject)) {
    throw new Fault(DRAWS, "the entries are no JSON array of objects");
  }
  return stated.map((entry, i): Entry => {
    const at = `${DRAWS}[${i}]`;
    if (typeof entry["step"] === "string") return stepOf(entry, at);
    if (typeof entry["label"] !== "string" || !("value" in entry)) {
      throw new Fault(at, "the entry states no step, and no label or no value");
    }
    try {
      return { label: entry["label"], value: literal.decode(entry["value"]) };
    } catch (err) {
      throw new Fault(`${at}.value`, "the value is no typed literal", err);
    }
  });
}

/** Returns the choices of the token that the run replays, or undefined for a run that replays none. */
function replayOf(config: Config): Choice[] | undefined {
  const stated = tokenOf(config.replay, config.hermetic);
  if (stated === undefined) return undefined;
  try {
    return token.decode(stated.token);
  } catch (err) {
    throw new Fault(stated.source, "no encoder writes the token", err);
  }
}

/** Returns the observer that hands the calls of each case to slot, under the case's phase. */
function observerOf(slot: Slot | undefined): Observer {
  return (phase, execution) => slot?.take(own(caseOf(execution.case)), phase);
}

/** Writes the text of a fault that does not end the call of op where the test runner shows it beside the test. */
function note(op: string, fault: Fault): void {
  console.warn(ofOperation(op, fault).message);
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

  private constructor(
    call: Call,
    settings: Stated,
    entries: readonly Entry[],
    budget: number,
    replay: readonly Choice[] | undefined,
    dir: string,
  ) {
    this.call = call;
    this.#settings = settings;
    this.#entries = entries;
    this.#budget = budget;
    this.#replay = replay;
    this.#dir = dir;
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
    if (!this.#claim(seat, running)) return;
    const cases = this.#adapt(seat, running.slot, body);
    const observer = observerOf(running.slot);
    if (this.#replay !== undefined) {
      const replayed = run(
        cases,
        { ...this.#settings, replay: this.#replay },
        observer,
      );
      const outcome = await this.#drive(running, replayed);
      if (outcome !== undefined) this.#report(running, outcome);
      return;
    }
    const loaded = this.#load(running);
    if (loaded === undefined) return;
    const settings = {
      ...this.#settings,
      stored: loaded.entries.map((entry) => entry.choices),
    };
    const saved: Fault[] = [];
    const concluded = (found: Outcome): void => {
      saved.push(...this.#save(found));
    };
    const work =
      this.#budget > 0
        ? campaign(cases, { ...settings, budget: this.#budget, concluded }, observer)
        : run(cases, settings, observer);
    const outcome = await this.#drive(running, work);
    if (outcome === undefined) return;
    if (outcome.kind === "counterexample" && this.#budget === 0) concluded(outcome);
    for (const fault of [...this.#storeFaults(loaded, outcome), ...saved])
      note(this.call.op, fault);
    this.#report(running, outcome);
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
    if (!this.#claim(seat, running)) return;
    const loaded = this.#load(running);
    if (loaded === undefined) return;
    const settings = {
      ...this.#settings,
      stored: loaded.entries.map((entry) => entry.choices),
    };
    const work = runStored(
      this.#adapt(seat, running.slot, body),
      settings,
      observerOf(running.slot),
    );
    const outcome = await this.#drive(running, work);
    if (outcome === undefined) return;
    for (const fault of this.#storeFaults(loaded, outcome)) note(this.call.op, fault);
    this.#report(running, outcome);
  }

  /**
   * Runs the case that the fuzz bridge decodes from data as a call of the
   * property on seat, as the call running, and reports it. A passing case
   * counts one valid or one rejected case. A failing case is replayed,
   * shrunk and explained as a run concludes it, and the store keeps each
   * failure of the counterexample.
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
    const cases = this.#adapt(seat, running.slot, body);
    const observer = observerOf(running.slot);
    const settings = this.#settings;
    function* bridged(): Work<Outcome> {
      const execution = yield* execute(cases, new Bridging(data), settings.maxChoices);
      observer("fuzz", execution);
      const tally = new Tally(settings.seed);
      if (tally.take(execution) === undefined) return tally.outcome("passed");
      return yield* concludeCase(cases, settings, execution, observer);
    }
    const outcome = await this.#drive(running, bridged());
    if (outcome === undefined) return;
    if (outcome.kind === "counterexample") {
      for (const fault of this.#save(outcome)) note(this.call.op, fault);
    }
    this.#report(running, outcome);
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

  /** Returns the engine's body that runs body on a case of seat, and stops the run once the seat's signal aborts. */
  #adapt(seat: Seat, slot: Slot | undefined, body: PropertyBody): Body {
    const signal = signalOf(seat);
    const location: Location = {
      site: this.call.where,
      pinned: this.call.pinned === true,
    };
    return (engine) => {
      if (signal.aborted) throw new Stopped(signal.reason);
      return executeCase(new Case(engine, seat, slot, location), body);
    };
  }

  /** Claims the property's entries in its store, and ends the call with a fault when another property of the test has claimed them. */
  #claim(seat: Seat, running: Running): boolean {
    if (claim(seat, this.#dir, this.call.contract)) return true;
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
    if (this.#dir === "") return { entries: [], skipped: [] };
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
      this.#fault(running, err instanceof TraceError ? this.#refusal(err) : err);
      return undefined;
    }
  }

  /** Returns the fault at the entry of the draws option that the body cannot follow. */
  #refusal(err: TraceError): Fault {
    const at = `${DRAWS}[${err.entry}].${err.reason}`;
    const entry = this.#entries[err.entry] as Entry;
    const label = JSON.stringify(err.what);
    if (err.reason === "step")
      return new Fault(at, `the machine cannot take the step ${label} there`);
    if (err.reason === "value") {
      return new Fault(
        at,
        `the generator of the draw labelled ${label} does not produce the entry's value`,
      );
    }
    const taken = isStep(entry)
      ? `the step entry of ${JSON.stringify(entry.action)}`
      : `the entry labelled ${JSON.stringify(entry.label)}`;
    return new Fault(at, `the draw labelled ${label} takes ${taken}`);
  }

  /**
   * Writes an entry of the failing case of a counterexample, and one of each
   * of its other failures, and returns the fault of each entry that the
   * store cannot keep. A property without a store writes none, and neither
   * does a property in a process of a mutation run, nor a counterexample of
   * values, whose values are in the test's source.
   */
  #save(outcome: Outcome): Fault[] {
    if (this.#dir === "" || mutated() || outcome.valued) return [];
    const found = new Date().toISOString().slice(0, 10);
    const faults: Fault[] = [];
    for (const execution of [outcome.failing as Execution, ...outcome.others]) {
      const { name, entry } = entryOf(this.call.contract, execution, found);
      try {
        save(this.#dir, name, entry);
      } catch (err) {
        const contract = JSON.stringify(this.call.contract);
        faults.push(
          new Fault(this.#dir, `the store keeps no case of ${contract}`, err),
        );
      }
    }
    return faults;
  }

  /** Returns the fault of each file of the store that the run skipped, and of each stored case that decodes to other values than its entry records. */
  #storeFaults(loaded: Loaded, outcome: Outcome): Fault[] {
    const skipped = loaded.skipped.map(
      (name) =>
        new Fault(
          join(this.#dir, name),
          "the entry is of a later format, so the run skips it",
        ),
    );
    const differences = outcome.stored.flatMap((execution, i) => {
      const entry = loaded.entries[i] as Stored;
      if (!differs(entry.counterexample, execution)) return [];
      const reason =
        "the stored case decodes to other values than it records, and the run tested those";
      return [new Fault(join(this.#dir, entry.name), reason)];
    });
    return [...skipped, ...differences];
  }

  /** Reports the outcome as the verdict of the call running. */
  #report(running: Running, outcome: Outcome): void {
    const { assertion, contract, where } = this.call;
    if (outcome.kind === "passed") {
      running.passRun(
        Mode.Fatal,
        assertion,
        contract,
        where,
        detailJson(outcome, detailOf(outcome)),
      );
      return;
    }
    const { failure, json } = recordOf(outcome, assertion, contract, where);
    running.failRun(Mode.Fatal, failure, json);
  }
}
