// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * What a property writes to its store, the stored cases that it replays,
 * and the faults of the store that do not end its call.
 */

import { join } from "node:path";
import { Fault } from "../../matcher/fault.js";
import { type Loaded, type Stored, save } from "../directory.js";
import type { Execution } from "../engine/execution.js";
import type { Stored as StoredCase, StoredRun } from "../engine/stored.js";
import type { Outcome } from "../engine/tally.js";
import { mutated } from "../environment.js";
import { differs, entryOf, storedOf, traceOf } from "../stored.js";
import { refusalOf } from "./replay.js";

/** The field of the counterexample of an entry of the store, at the front of the location of the refusal of a stored case. */
const COUNTEREXAMPLE = "counterexample";

/** The reason of the note on a stored case whose run replayed the counterexample of its entry. */
const REPLAYED =
  "the stored case decodes to other values than it records, and the run replayed its counterexample";

/** The reason of the note on a stored case whose run tested the values that its choices decode to. */
const TESTED =
  "the stored case decodes to other values than it records, and the run tested those";

/** Returns the reason that the run of a stored case did not count its trace, or undefined for a case of the choices that failed, whose trace the run does not follow. */
function untraced(entry: Stored, ran: StoredRun): Fault | undefined {
  if (ran.refusal !== undefined) {
    return refusalOf(ran.refusal, traceOf(entry.counterexample), COUNTEREXAMPLE);
  }
  if (ran.untaken !== undefined) {
    return new Fault(
      `${COUNTEREXAMPLE}[${ran.untaken}]`,
      "the case of the counterexample leaves the entry untaken",
    );
  }
  return undefined;
}

/**
 * Returns the stored case of each entry of a store, from the oldest.
 *
 * @param loaded - The entries of the store.
 * @returns The stored cases.
 */
export function storedCases(loaded: Loaded): StoredCase[] {
  return loaded.entries.map((entry) => storedOf(entry.choices, entry.counterexample));
}

/**
 * Writes an entry of the failing case of a counterexample, and one of each
 * of its other failures, and returns the fault of each entry that the store
 * cannot keep. A property without a store writes none, and neither does a
 * property in a process of a mutation run, nor a counterexample of values,
 * whose values are in the test's source.
 *
 * @param dir - The directory of the store, or the empty string for none.
 * @param contract - The property's contract.
 * @param outcome - The outcome of the run.
 * @returns The faults.
 */
export function saveOutcome(dir: string, contract: string, outcome: Outcome): Fault[] {
  if (dir === "" || mutated() || outcome.valued) {
    return [];
  }
  const found = new Date().toISOString().slice(0, 10);
  const faults: Fault[] = [];
  for (const execution of [outcome.failing as Execution, ...outcome.others]) {
    const { name, entry } = entryOf(contract, execution, found);
    try {
      save(dir, name, entry);
    } catch (err) {
      const stated = JSON.stringify(contract);
      faults.push(
        new Fault(dir, `the store keeps no case of ${stated}`, {
          cause: err,
        }),
      );
    }
  }
  return faults;
}

/**
 * Returns the fault of each file of the store that the run skipped, and of
 * each stored case that decodes to other values than its entry records. The
 * fault states that the run replayed the counterexample of the entry, or
 * that it tested the values of the choices. The cause of the second fault
 * is the reason that the run did not count the trace.
 *
 * @param dir - The directory of the store.
 * @param loaded - The entries of the store that the run replayed.
 * @param outcome - The outcome of the run.
 * @returns The faults.
 */
export function storeFaults(dir: string, loaded: Loaded, outcome: Outcome): Fault[] {
  const skipped = loaded.skipped.map(
    (name) =>
      new Fault(join(dir, name), "the entry is of a later format, so the run skips it"),
  );
  const differences = outcome.stored.flatMap((ran, i) => {
    const entry = loaded.entries[i] as Stored;
    const at = join(dir, entry.name);
    if (ran.replayed) {
      return [new Fault(at, REPLAYED)];
    }
    if (!differs(entry.counterexample, ran.execution)) {
      return [];
    }
    return [new Fault(at, TESTED, { cause: untraced(entry, ran) })];
  });
  return [...skipped, ...differences];
}
