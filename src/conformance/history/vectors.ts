// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The runners of the history vectors.
 *
 * A seam vector records a script through a History, or intervals through
 * fromIntervals, and compares the events in the history's JSON form, or the
 * entry that the seam refuses, with the vector's. A linearizable vector
 * checks a recorded script with isLinearizable against a named spec on a
 * recorder, and a serializable or a snapshot-isolation vector checks one
 * with the check of its level. Each compares the verdict and the detail of
 * the call record with the vector's.
 */

import { eventJson } from "../../history/event.js";
import {
  budget,
  type History,
  hasSnapshotIsolation,
  isLinearizable,
  isSerializable,
  memoLimit,
  type Option,
  workers,
} from "../../history/index.js";
import { Fault } from "../../matcher/fault.js";
import type { Seat } from "../../matcher/seat.js";
import { compareText } from "../../order.js";
import { Recorder } from "../../seat.js";
import { sameJson } from "../equality.js";
import { intervals, record } from "./script.js";
import { SPECS } from "./specs.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The contract of the check of a linearizable vector. */
const LINEARIZABLE_CONTRACT = "the history of the vector is linearizable";

/** The contract of the check of an isolation vector. */
const ISOLATION_CONTRACT = "the transactions of the vector are isolated";

/** Compares the events of a history, or the entry that its seam refused, with the ones a seam vector states. */
function checkSeam(raw: Raw): void {
  if ("script" in raw === "intervals" in raw) {
    throw new Fault("", "the vector states a script or intervals");
  }
  const { history, refused } =
    "script" in raw ? record(raw["script"], "script") : intervals(raw["intervals"]);
  const want = raw["refused"] ?? null;
  if ((refused ?? null) !== want) {
    throw new Fault(
      "refused",
      `the seam refuses ${refused === undefined ? "no entry" : `entry ${refused}`}, want ${JSON.stringify(want)}`,
    );
  }
  if (refused !== undefined) {
    return;
  }
  const events = (history as History).events().map(eventJson);
  const stated = raw["events"];
  if (!Array.isArray(stated)) {
    throw new Fault("events", "the events are no list");
  }
  events.forEach((event, i) => {
    if (i < stated.length && !sameJson(event, stated[i])) {
      throw new Fault(
        `events[${i}]`,
        `the event is ${JSON.stringify(event)}, want ${JSON.stringify(stated[i])}`,
      );
    }
  });
  if (events.length !== stated.length) {
    throw new Fault(
      "events",
      `the number of events is ${events.length}, want ${stated.length}`,
    );
  }
}

/** Returns the history of a check vector's script, and a fault at the entry that the seam refuses. */
function historyOf(raw: Raw): History {
  const { history, refused } = record(raw["history"], "history");
  if (refused !== undefined) {
    throw new Fault(`history[${refused}]`, "the seam refuses the entry");
  }
  return history;
}

/** Returns the call record of check on a recorder, as JSON. */
function recordOf(check: (seat: Seat) => void): Raw {
  const recorder = new Recorder();
  check(recorder);
  return JSON.parse(recorder.records[0] as string) as Raw;
}

/** Throws a fault for a call record whose verdict or whose detail differs from the vector's. */
function compareVerdict(call: Raw, raw: Raw): void {
  const expect = raw["expect"];
  if (expect !== "pass" && expect !== "fail") {
    throw new Fault(
      "expect",
      `the vector expects ${JSON.stringify(expect)}, neither pass nor fail`,
    );
  }
  if (call["verdict"] !== expect) {
    throw new Fault(
      "expect",
      `the check ends as ${String(call["verdict"])}, want ${expect}`,
    );
  }
  if (expect === "pass") {
    return;
  }
  const detail = call["detail"] as Raw;
  const stated = raw["detail"] as Raw;
  for (const name of Object.keys(stated).sort(compareText)) {
    if (!(name in detail)) {
      throw new Fault(
        `detail.${name}`,
        `the record states no such field, want ${JSON.stringify(stated[name])}`,
      );
    }
    if (!sameJson(detail[name], stated[name])) {
      throw new Fault(
        `detail.${name}`,
        `the field is ${JSON.stringify(detail[name])}, want ${JSON.stringify(stated[name])}`,
      );
    }
  }
}

/** Returns the options of a check that a vector states, and a fault at a member that states no positive integer. */
function optionsOf(raw: Raw): Option[] {
  const options: Option[] = [];
  const stated: [string, (n: number) => Option][] = [
    ["budget", budget],
    ["memo-limit", memoLimit],
    ["workers", workers],
  ];
  for (const [member, option] of stated) {
    const n = raw[member];
    if (n !== undefined) {
      if (!Number.isSafeInteger(n) || (n as number) < 1) {
        throw new Fault(
          member,
          `the ${member} is ${JSON.stringify(n)}, no integer of 1 or more`,
        );
      }
      options.push(option(n as number));
    }
  }
  return options;
}

/**
 * Checks the history of a linearizable vector against its named spec, and
 * compares the call record with the vector's. A passing check states no
 * detail, so the runner observes the steps of a passing vector through two
 * more checks: under a budget of the steps it passes, and under a budget of
 * one step less it ends undecided at the steps limit after that budget.
 */
function checkLinearizable(raw: Raw): void {
  const spec = SPECS.get(String(raw["spec"]));
  if (spec === undefined) {
    throw new Fault("spec", `${JSON.stringify(raw["spec"])} is no named spec`);
  }
  const history = historyOf(raw);
  const options = optionsOf(raw);
  const checked = (...more: Option[]) =>
    recordOf((seat) =>
      isLinearizable(seat, history, spec, LINEARIZABLE_CONTRACT, ...options, ...more),
    );
  const call = checked();
  compareVerdict(call, raw);
  if (raw["expect"] === "fail") {
    return;
  }
  const stated = raw["detail"] as Raw;
  const steps = stated["steps"];
  if (
    stated["partitions"] !== 1 ||
    !Number.isSafeInteger(steps) ||
    (steps as number) < 2
  ) {
    throw new Fault(
      "detail",
      `the runner observes the steps of a pass over one partition in two steps or more, and the vector states the partitions ${JSON.stringify(stated["partitions"])} and the steps ${JSON.stringify(steps)}`,
    );
  }
  const exact = checked(budget(steps as number));
  if (exact["verdict"] !== "pass") {
    throw new Fault(
      "detail.steps",
      `the check ends as ${String(exact["verdict"])} within ${String(steps)} steps, want pass`,
    );
  }
  const under = checked(budget((steps as number) - 1));
  const detail = (under["detail"] ?? {}) as Raw;
  const want = {
    outcome: "undecided",
    partitions: 1,
    steps: (steps as number) - 1,
    limit: "steps",
  };
  const got = {
    outcome: detail["outcome"],
    partitions: detail["partitions"],
    steps: detail["steps"],
    limit: detail["limit"],
  };
  if (under["verdict"] !== "fail" || !sameJson(got, want)) {
    throw new Fault(
      "detail.steps",
      `the check within ${(steps as number) - 1} steps ends as ${String(under["verdict"])} with ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
  }
}

/** Returns the runner of the isolation vectors of the check. */
function checkIsolation(
  check: (seat: Seat, history: History, msg: string) => void,
): (raw: Raw) => void {
  return (raw) => {
    const history = historyOf(raw);
    compareVerdict(
      recordOf((seat) => check(seat, history, ISOLATION_CONTRACT)),
      raw,
    );
  };
}

/**
 * The runner of each kind of history vector. A runner throws a fault at the
 * part of the vector that the run contradicts, and for a vector that it
 * cannot read.
 */
export const RUNNERS: ReadonlyMap<string, (raw: Raw) => void> = new Map([
  ["seam", checkSeam],
  ["linearizable", checkLinearizable],
  ["serializable", checkIsolation(isSerializable)],
  ["snapshot-isolation", checkIsolation(hasSnapshotIsolation)],
]);
