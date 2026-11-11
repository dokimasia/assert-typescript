// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The entries of a property's store, as a property writes and checks them.
 *
 * A property writes one entry for each failure of a counterexample: the
 * failure's identity, the minimal case's choices, and the draws and the
 * steps of the case in request order. A draw has the typed literal of its
 * value, which its generator states, and a draw whose value has no typed
 * literal is recorded by its label alone. A step of a machine has its
 * action, its client and its drain mark. The entry of a case with a step is
 * of format 2.
 *
 * A stored case replays its choices, so a change of a generator or of the
 * actions of a machine can make it decode to other values than its entry
 * records. The run then follows the counterexample of the entry as a trace,
 * and the property notes the difference.
 */

import { DEFINITION } from "../record/call.js";
import type { Failing } from "./case.js";
import type { Drawn, Step } from "./engine/case/record.js";
import type { Case } from "./engine/case.js";
import type { Choice } from "./engine/choice.js";
import type { Execution } from "./engine/execution.js";
import * as literal from "./engine/literal.js";
import * as store from "./engine/store.js";
import { Stored } from "./engine/stored.js";
import { type Entry, entries, isStep, UNSTATED } from "./engine/trace.js";
import { canonical } from "./engine/value.js";
import { entryOf as identityOf } from "./identity.js";
import { drawnLiteral } from "./literal.js";

/** An entry of the counterexample of an entry of the store. */
type Recorded = Readonly<Record<string, unknown>>;

/** The fields of a step entry of the counterexample of an entry. */
const STEP_FIELDS = ["step", "client", "drain"] as const;

/** Returns each draw of a case as an entry records it: its label, and the typed literal of its value when one states it. */
function drawsOf(draws: readonly Drawn[]): Record<string, unknown>[] {
  return draws.map((drawn) => {
    const value = drawnLiteral(drawn.generator, drawn.value);
    return value === undefined ? { label: drawn.label } : { label: drawn.label, value };
  });
}

/** Returns a step of a machine as an entry records it: its action, the client of a concurrent section and the drain mark of the drain. */
function stepOf(step: Step): Record<string, unknown> {
  return {
    step: step.action,
    ...(step.client === undefined ? {} : { client: step.client }),
    ...(step.drain === true ? { drain: true } : {}),
  };
}

/** Returns the draws and the steps of a case as an entry records them, in request order. */
function recordedOf(c: Case): Record<string, unknown>[] {
  const draws = drawsOf(c.draws);
  let next = 0;
  return entries(c).map((entry) => {
    if (isStep(entry)) {
      return stepOf(entry);
    }
    next += 1;
    return draws[next - 1] as Record<string, unknown>;
  });
}

/** Returns the canonical text of the value of a typed literal, or undefined for a literal that does not decode. */
function literalKey(written: unknown): string | undefined {
  try {
    return canonical(literal.decode(written));
  } catch {
    return undefined;
  }
}

/** Reports whether one entry of a replayed case differs from the entry of a store. A step differs from every draw, and from a step of another action, client or drain mark. */
function itemDiffers(entry: Recorded, item: Recorded): boolean {
  if ("step" in entry || "step" in item) {
    return STEP_FIELDS.some((field) => entry[field] !== item[field]);
  }
  if (entry["label"] !== item["label"]) {
    return true;
  }
  if (!("value" in entry)) {
    return false;
  }
  const value = literalKey(entry["value"]);
  return (
    value === undefined || !("value" in item) || value !== literalKey(item["value"])
  );
}

/** Returns one entry of the counterexample of an entry as an entry of a trace, whose draw has the value UNSTATED where no typed literal states it. */
function traceEntry(item: Recorded): Entry {
  if (typeof item["step"] === "string") {
    const client = item["client"];
    return {
      action: item["step"],
      ...(typeof client === "number" ? { client } : {}),
      ...(item["drain"] === true ? { drain: true } : {}),
    };
  }
  let value: unknown = UNSTATED;
  if ("value" in item) {
    try {
      value = literal.decode(item["value"]);
    } catch {
      value = UNSTATED;
    }
  }
  return { label: item["label"] as string, value };
}

/**
 * Returns the file name and the content of the entry that keeps a failing
 * execution of the property contract, found on the UTC date found.
 *
 * @param contract - The property's contract.
 * @param execution - The failing execution, a minimal case.
 * @param found - The UTC date, as YYYY-MM-DD.
 * @returns The entry's name and its JSON object.
 */
export function entryOf(
  contract: string,
  execution: Execution,
  found: string,
): { readonly name: string; readonly entry: Record<string, unknown> } {
  const { choices } = execution.case;
  const failing = execution.failure?.record as Failing;
  const failure: store.Failure = {
    contract,
    choices,
    identity: identityOf(failing.identity),
    counterexample: recordedOf(execution.case),
  };
  return {
    name: store.name(contract, choices),
    entry: store.entry(failure, DEFINITION, found),
  };
}

/**
 * Reports whether the replay of a stored case decodes to other values than
 * its entry records: other labels, another number of draws, or another
 * value of a draw whose value the entry records. An entry with a step also
 * differs from a replay with other steps, or with its steps at other places
 * among its draws. The steps of the replay do not count against an entry
 * without a step. Two values are the same when their typed literals state
 * one value, so the spelling of a number in a file that another
 * implementation wrote does not count, and a recorded -0 differs from a
 * replayed +0. A recorded value that does not decode differs from every
 * value.
 *
 * @param recorded - The counterexample that the entry records.
 * @param replayed - The run of the stored case.
 * @returns Whether the two differ.
 */
export function differs(recorded: readonly Recorded[], replayed: Execution): boolean {
  const all = recordedOf(replayed.case);
  const steps = recorded.some((entry) => "step" in entry);
  const replay = steps ? all : all.filter((item) => !("step" in item));
  if (recorded.length !== replay.length) {
    return true;
  }
  return recorded.some((entry, i) => itemDiffers(entry, replay[i] as Recorded));
}

/**
 * Returns the counterexample of an entry as a trace. A draw without a value
 * has the value UNSTATED, and so does a draw whose value does not decode.
 * The body refuses such a draw.
 *
 * @param recorded - The counterexample that the entry records.
 * @returns The entries of the trace, in request order.
 */
export function traceOf(recorded: readonly Recorded[]): Entry[] {
  return recorded.map(traceEntry);
}

/**
 * Returns the stored case of an entry. A case of the choices matches the
 * entry when its values do not differ from the counterexample, and after
 * any other case of the choices the run follows the counterexample as a
 * trace.
 *
 * @param choices - The choices of the entry.
 * @param recorded - The counterexample that the entry records.
 * @returns The stored case.
 */
export function storedOf(
  choices: readonly Choice[],
  recorded: readonly Recorded[],
): Stored {
  return new Stored(
    choices,
    traceOf(recorded),
    (execution) => !differs(recorded, execution),
  );
}
