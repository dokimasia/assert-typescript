// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The runner of the resume vectors, which checks the prefixes of a script
 * with one Checkpoint.
 */

import { Checkpoint, type Option, resume, type Spec } from "../../history/index.js";
import { Fault } from "../../matcher/fault.js";
import {
  compareVerdict,
  linearizableRecord,
  namedSpec,
  optionsOf,
  type Raw,
} from "./check.js";
import { Recording } from "./script.js";

/** Returns spec with a next that adds 1 to calls.n for each call. */
function counted(spec: Spec<unknown>, calls: { n: number }): Spec<unknown> {
  return {
    ...spec,
    next: (state, op) => {
      calls.n += 1;
      return spec.next(state, op);
    },
  };
}

/** Reports whether a JSON value is an object. */
function isObject(raw: unknown): raw is Raw {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/**
 * Returns the events that one check of a resume vector reads and its
 * options, and a fault at the check for one that it cannot read. read is the
 * number of events that the check before it read, and events the number of
 * events of the history.
 */
function settingsOf(
  raw: unknown,
  read: number,
  events: number,
  at: string,
): [number, Option[]] {
  if (!isObject(raw)) {
    throw new Fault(at, "the check is no object");
  }
  const least = Math.max(read, 1);
  const n = raw["events"];
  if (!Number.isSafeInteger(n) || (n as number) < least || (n as number) > events) {
    throw new Fault(
      `${at}.events`,
      `the check reads ${JSON.stringify(n)} events, want ${least} to ${events}`,
    );
  }
  try {
    return [n as number, optionsOf(raw)];
  } catch (err) {
    throw (err as Fault).within(at);
  }
}

/**
 * Throws a fault for a call record of one check of a resume vector that
 * differs from its result. calls is the number of calls of next that the
 * check made, and steps returns the calls of next of a check of every call.
 * Each named spec takes one step for each call of next, so a pass compares
 * its steps with them.
 */
function compareResult(
  call: Raw,
  calls: number,
  steps: () => number,
  raw: unknown,
): void {
  if (!isObject(raw)) {
    throw new Fault("", "the result is no object");
  }
  compareVerdict(call, raw);
  if (raw["expect"] === "pass") {
    const stated = ((raw["detail"] ?? {}) as Raw)["steps"];
    if (!Number.isSafeInteger(stated)) {
      throw new Fault(
        "detail.steps",
        `the detail states the steps ${JSON.stringify(stated ?? null)}, want a number`,
      );
    }
    const every = steps();
    if (every !== stated) {
      throw new Fault(
        "detail.steps",
        `a check of every call takes ${every} steps, want ${String(stated)}`,
      );
    }
  }
  const wanted = raw["next-calls"];
  if (wanted !== calls) {
    throw new Fault(
      "next-calls",
      `the check calls next ${calls} times, want ${JSON.stringify(wanted)}`,
    );
  }
}

/**
 * Checks the prefixes of the history of a resume vector with one checkpoint.
 * The runner records the history of the vector through one history, up to
 * the events of each check in turn, and checks each prefix with
 * isLinearizable against the named spec under the limits of the check. Every
 * check passes one Checkpoint, and the runner counts the calls of the next
 * of the spec that each check makes. It compares the verdict, the detail of
 * a failing check and the calls of next with the result of the check. A
 * passing check states no detail, so the runner compares the steps of a pass
 * with the calls of next of a check of the prefix without the checkpoint.
 *
 * @param raw - The vector.
 * @throws Fault at the part of the vector that the run contradicts, and at a
 *   part that the runner cannot read.
 */
export function checkResume(raw: Raw): void {
  const spec = namedSpec(raw);
  const recording = new Recording(raw["history"], "history");
  const checks = raw["checks"];
  if (!Array.isArray(checks)) {
    throw new Fault("checks", "the checks are no list");
  }
  const results = Array.isArray(raw["results"]) ? (raw["results"] as unknown[]) : [];
  if (results.length !== checks.length) {
    throw new Fault(
      "results",
      `the vector states ${results.length} results, want one for each of ${checks.length} checks`,
    );
  }
  const checkpoint = new Checkpoint<unknown>();
  let read = 0;
  checks.forEach((check: unknown, i) => {
    const [events, options] = settingsOf(
      check,
      read,
      recording.entries.length,
      `checks[${i}]`,
    );
    const refused = recording.through(events);
    if (refused !== undefined) {
      throw new Fault(`history[${refused}]`, "the seam refuses the entry");
    }
    read = events;
    const calls = { n: 0 };
    const call = linearizableRecord(recording.history, counted(spec, calls), [
      ...options,
      resume(checkpoint),
    ]);
    const steps = () => {
      const fresh = { n: 0 };
      linearizableRecord(recording.history, counted(spec, fresh), options);
      return fresh.n;
    };
    try {
      compareResult(call, calls.n, steps, results[i]);
    } catch (err) {
      throw (err as Fault).within(`results[${i}]`);
    }
  });
}
