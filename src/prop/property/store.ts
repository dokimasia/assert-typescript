// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * What a property writes to its store, and the faults of the store that do
 * not end its call.
 */

import { join } from "node:path";
import { Fault } from "../../matcher/fault.js";
import { type Loaded, type Stored, save } from "../directory.js";
import type { Execution } from "../engine/execution.js";
import type { Outcome } from "../engine/tally.js";
import { mutated } from "../environment.js";
import { differs, entryOf } from "../stored.js";

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
 * each stored case that decodes to other values than its entry records.
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
  const differences = outcome.stored.flatMap((execution, i) => {
    const entry = loaded.entries[i] as Stored;
    if (!differs(entry.counterexample, execution)) {
      return [];
    }
    const reason =
      "the stored case decodes to other values than it records, and the run tested those";
    return [new Fault(join(dir, entry.name), reason)];
  });
  return [...skipped, ...differences];
}
