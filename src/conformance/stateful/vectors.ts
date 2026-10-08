/**
 * The runner of the machines vectors.
 *
 * A machines vector names a machine subject, and may state the options of
 * its steps as its setup, the settings of the run, and a trace. The runner
 * runs the subject with prop.forAll on a recorder, after the trace, and
 * compares the detail of the property's call record with the vector's
 * detail. A vector whose trace the run refuses states the entry, the name of
 * its step and the reason as its error, which the runner compares with the
 * fault that ends the call.
 */

import { Fault } from "../../matcher/fault.js";
import { forAll } from "../../prop/forall.js";
import { cases, draws, hermetic, type Option, seed, store } from "../../prop/option.js";
import { Recorder } from "../../seat.js";
import {
  clients,
  concurrent,
  max,
  mean,
  type Option as StepsOption,
  swarm,
} from "../../stateful/option.js";
import { pct, type Strategy, uniform } from "../../stateful/strategy.js";
import { sameJson } from "../literal.js";
import { type Setup, SUBJECTS } from "./subjects.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The contract of the property that runs a machine subject. */
const CONTRACT = "the machine subject of the vector";

/** The clients of a vector's setup that states none. */
const SETUP_CLIENTS = 2;

/** Reports whether value is a JSON object. */
function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the strategy that a setup states: uniform, or the PCT of a depth that `{"pct": depth}` states. */
function strategyOf(written: unknown): Strategy {
  if (written === "uniform") return uniform();
  if (isObject(written) && Object.keys(written).join() === "pct") {
    return pct(Number(written["pct"]));
  }
  throw new Fault("setup.strategy", `${JSON.stringify(written)} is no strategy`);
}

/** Returns the options that a vector's setup states, with the clients of the definition's setup for a setup that states none. */
function setupOf(written: Raw): Setup {
  const steps: StepsOption[] = [];
  if (written["mean"] !== undefined) steps.push(mean(Number(written["mean"])));
  if (written["max"] !== undefined) steps.push(max(Number(written["max"])));
  if (written["swarm"] !== undefined) steps.push(swarm(written["swarm"] === true));
  const section = [clients(Number(written["clients"] ?? SETUP_CLIENTS))];
  if (written["concurrent"] !== undefined) {
    section.push(concurrent(Number(written["concurrent"])));
  }
  return { steps, section, strategy: strategyOf(written["strategy"] ?? "uniform") };
}

/** Returns the options of the run that a vector's settings state: its seed and its cases, without the profile, the variables and a store. */
function settingsOf(written: Raw): Option[] {
  const options: Option[] = [hermetic(), store("")];
  for (const [name, value] of Object.entries(written)) {
    if (name === "seed") options.push(seed(BigInt(String(value))));
    else if (name === "cases") options.push(cases(Number(value)));
    else throw new Fault(`settings.${name}`, "the runner takes no such setting");
  }
  return options;
}

/**
 * Returns the detail of a property's call record in the form of the
 * vector's detail, which states the failure by its assertion. No machines
 * vector states another failure, so the runner compares the others of a run
 * as the call record states them.
 */
function detailOf(record: Raw): Raw {
  const detail = record["detail"] as Raw;
  const failure = detail["failure"];
  return { ...detail, failure: isObject(failure) ? failure["assertion"] : null };
}

/** Throws a fault for a fault of the run other than the refusal of the trace's entry that the vector states. */
function compareRefusal(message: string, error: Raw): void {
  const at = `prop.forAll: draws[${String(error["entry"])}].${String(error["reason"])}: `;
  if (!message.startsWith(at) || !message.includes(JSON.stringify(error["name"]))) {
    throw new Fault(
      "error",
      `the run ends with ${JSON.stringify(message)}, want a refusal of entry ${String(error["entry"])} of ${JSON.stringify(error["name"])}`,
    );
  }
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
  const options = settingsOf((raw["settings"] ?? {}) as Raw);
  if (raw["trace"] !== undefined) options.push(draws(JSON.stringify(raw["trace"])));
  const subject = make();
  const recorder = new Recorder();
  await forAll(recorder, CONTRACT, (c) => subject(c, setup), ...options);
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
