// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The runner of the machines vectors.
 *
 * A machines vector names a machine subject, and may state the options of
 * its steps as its setup, the settings of the run, and a trace. The runner
 * runs the subject with prop.forAll on a recorder, after the trace, and
 * compares the detail of the property's call record with the vector's
 * detail. A vector whose trace the run refuses states the entry, the name of
 * its step and the reason as its error, which the runner compares with the
 * fault that ends the call. The stored cases of the settings are entries of
 * a store of the run, in a directory that the runner removes afterwards.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Fault } from "../../matcher/fault.js";
import { save } from "../../prop/directory.js";
import * as entries from "../../prop/engine/store.js";
import { forAll } from "../../prop/forall.js";
import { cases, draws, hermetic, type Option, seed, store } from "../../prop/option.js";
import { DEFINITION } from "../../record/call.js";
import { Recorder } from "../../seat.js";
import {
  clients,
  concurrent,
  concurrentMean,
  max,
  mean,
  type Option as StepsOption,
  swarm,
} from "../../stateful/option.js";
import { MAX_RELEASES } from "../../stateful/scheduler.js";
import { pct, type Strategy, uniform } from "../../stateful/strategy.js";
import { sameJson } from "../equality.js";
import { storedCaseOf } from "../prop/replay.js";
import { type Setup, SUBJECTS, type Subject } from "./subjects.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The contract of the property that runs a machine subject. */
const CONTRACT = "the machine subject of the vector";

/** The clients of a vector's setup that states none. */
const SETUP_CLIENTS = 2;

/** The identity of the failure of a scheduler at its most releases. */
const RELEASES = "max-releases";

/** The identity of the entries of the stored cases of a vector. */
const STORED = { assertion: "stored", contract: "a stored case of the vector" };

/** The date of the entry of a vector's first stored case, and the milliseconds of a day: each later case is found a day later, so the store replays them in order. */
const FIRST_FOUND = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;

/** Reports whether value is a JSON object. */
function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the strategy that a setup states: uniform, or the PCT of a depth that `{"pct": depth}` states. */
function strategyOf(written: unknown): Strategy {
  if (written === "uniform") {
    return uniform();
  }
  if (isObject(written) && Object.keys(written).join() === "pct") {
    return pct(Number(written["pct"]));
  }
  throw new Fault("setup.strategy", `${JSON.stringify(written)} is no strategy`);
}

/** Returns the names of the actions that a setup keeps in every case. */
function namesOf(written: unknown): readonly string[] {
  if (!(Array.isArray(written) && written.every((name) => typeof name === "string"))) {
    throw new Fault("setup.keep", `${JSON.stringify(written)} is no list of names`);
  }
  return written;
}

/** Returns the options that a vector's setup states, with the clients of the definition's setup for a setup that states none. */
function setupOf(written: Raw): Setup {
  const steps: StepsOption[] = [];
  if (written["mean"] !== undefined) {
    steps.push(mean(Number(written["mean"])));
  }
  if (written["max"] !== undefined) {
    steps.push(max(Number(written["max"])));
  }
  if (written["swarm"] !== undefined) {
    steps.push(swarm(written["swarm"] === true));
  }
  const section = [clients(Number(written["clients"] ?? SETUP_CLIENTS))];
  if (written["concurrent"] !== undefined) {
    section.push(concurrent(Number(written["concurrent"])));
  }
  if (written["concurrent-mean"] !== undefined) {
    section.push(concurrentMean(Number(written["concurrent-mean"])));
  }
  return {
    steps,
    section,
    strategy: strategyOf(written["strategy"] ?? "uniform"),
    maxReleases: Number(written["max-releases"] ?? MAX_RELEASES),
    keep: namesOf(written["keep"] ?? []),
  };
}

/** Writes each stored case of a vector's settings into the store dir, as an entry of the property that runs the machine subject. */
function writeStored(stored: unknown, dir: string): void {
  if (!Array.isArray(stored)) {
    throw new Fault("settings.stored", "the stored cases are no list");
  }
  stored.forEach((written, i) => {
    const { choices, counterexample } = storedCaseOf(written, i);
    const failure = { contract: CONTRACT, choices, identity: STORED, counterexample };
    const found = new Date(FIRST_FOUND + i * DAY).toISOString().slice(0, 10);
    save(
      dir,
      entries.name(CONTRACT, choices),
      entries.entry(failure, DEFINITION, found),
    );
  });
}

/**
 * Returns the options of the run that a vector's settings state: its seed,
 * its cases and the store dir of its stored cases, without the profile, the
 * variables and a store of a vector without stored cases.
 */
function settingsOf(written: Raw, dir: string): Option[] {
  const options: Option[] = [hermetic()];
  let directory = "";
  for (const [name, value] of Object.entries(written)) {
    if (name === "seed") {
      options.push(seed(BigInt(String(value))));
    } else if (name === "cases") {
      options.push(cases(Number(value)));
    } else if (name === "stored") {
      writeStored(value, dir);
      directory = dir;
    } else {
      throw new Fault(`settings.${name}`, "the runner takes no such setting");
    }
  }
  return [...options, store(directory)];
}

/**
 * Returns the detail of a property's call record in the form of the
 * vector's detail, which states the failure by its assertion. A scheduler
 * at its most releases fails the case with a record without an assertion,
 * and the vectors name that failure max-releases. No machines vector states
 * another failure, so the runner compares the others of a run as the call
 * record states them.
 */
function detailOf(record: Raw): Raw {
  const detail = record["detail"] as Raw;
  const failure = detail["failure"];
  return {
    ...detail,
    failure: isObject(failure) ? (failure["assertion"] ?? RELEASES) : null,
  };
}

/** Throws a fault for a fault of the run other than the refusal of the trace's entry that the vector states. */
function compareRefusal(message: string, error: Raw): void {
  const at = `prop.forAll: draws[${String(error["entry"])}].${String(error["reason"])}: `;
  if (!(message.startsWith(at) && message.includes(JSON.stringify(error["name"])))) {
    throw new Fault(
      "error",
      `the run ends with ${JSON.stringify(message)}, want a refusal of entry ${String(error["entry"])} of ${JSON.stringify(error["name"])}`,
    );
  }
}

/**
 * Runs subject under setup and the settings of a machines vector, after
 * its trace, with prop.forAll on a recorder, and returns the recorder. The
 * stored cases of the settings are entries of a store in a directory that
 * the runner removes once the run ends.
 */
async function recorded(raw: Raw, subject: Subject, setup: Setup): Promise<Recorder> {
  const settings = (raw["settings"] ?? {}) as Raw;
  const dir =
    settings["stored"] === undefined
      ? ""
      : mkdtempSync(join(tmpdir(), "dokimi-machines-"));
  const recorder = new Recorder();
  try {
    const options = settingsOf(settings, dir);
    if (raw["trace"] !== undefined) {
      options.push(draws(JSON.stringify(raw["trace"])));
    }
    await forAll(recorder, CONTRACT, (c) => subject(c, setup), ...options);
    await recorder.runCleanups();
  } finally {
    if (dir !== "") {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return recorder;
}

/**
 * Runs the subject of a machines vector under its setup and its settings,
 * after its trace, and compares the run with the detail or the error that
 * the vector states.
 *
 * @param raw - The vector's JSON object.
 * @returns A promise that settles when the run agrees with the vector.
 * @throws Fault at the part of the vector that the run contradicts, and for
 *   a vector that names no subject or states a setup or a setting that the
 *   runner cannot take.
 */
async function checkMachines(raw: Raw): Promise<void> {
  const make = SUBJECTS.get(String(raw["subject"]));
  if (make === undefined) {
    throw new Fault(
      "subject",
      `${JSON.stringify(raw["subject"])} names no machine subject`,
    );
  }
  const setup = setupOf((raw["setup"] ?? {}) as Raw);
  const recorder = await recorded(raw, make(), setup);
  const error = raw["error"];
  if (isObject(error)) {
    compareRefusal(recorder.message, error);
    return;
  }
  const record = JSON.parse(recorder.records[0] as string) as Raw;
  if (!isObject(record["detail"])) {
    throw new Fault("", `the run ends with ${JSON.stringify(recorder.message)}`);
  }
  const ours = detailOf(record);
  if (!sameJson(ours, raw["detail"])) {
    throw new Fault(
      "detail",
      `the run's detail is ${JSON.stringify(ours)}, want ${JSON.stringify(raw["detail"])}`,
    );
  }
}

/**
 * The runner of each kind of machines vector. A runner throws a fault at
 * the part of the vector that the run contradicts, and for a vector that it
 * cannot read.
 */
export const RUNNERS: ReadonlyMap<string, (raw: Raw) => Promise<void>> = new Map([
  ["machines", checkMachines],
]);
