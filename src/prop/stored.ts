/**
 * The entries of a property's store, as a property writes and checks them.
 *
 * A property writes one entry for each failure of a counterexample: the
 * failure's identity, the minimal case's choices, and each draw with the
 * typed literal of its value, which its generator states. A draw whose value
 * has no typed literal is recorded by its label alone.
 *
 * A stored case replays its choices, so a change of a generator can make it
 * decode to other values than its entry records. The run then tested those
 * values, and the property notes the difference.
 */

import { DEFINITION } from "../record/call.js";
import type { Failing } from "./case.js";
import type { Drawn } from "./engine/case.js";
import type { Execution } from "./engine/execution.js";
import * as literal from "./engine/literal.js";
import * as store from "./engine/store.js";
import { canonical } from "./engine/value.js";
import { entryOf as identityOf } from "./identity.js";
import { drawnLiteral } from "./literal.js";

/** Returns each draw of a case as an entry records it: its label, and the typed literal of its value when one states it. */
function drawsOf(draws: readonly Drawn[]): Record<string, unknown>[] {
  return draws.map((drawn) => {
    const value = drawnLiteral(drawn.generator, drawn.value);
    return value === undefined ? { label: drawn.label } : { label: drawn.label, value };
  });
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
  const choices = execution.case.choices;
  const failing = execution.failure?.record as Failing;
  const failure: store.Failure = {
    contract,
    choices,
    identity: identityOf(failing.identity),
    counterexample: drawsOf(execution.case.draws),
  };
  return {
    name: store.name(contract, choices),
    entry: store.entry(failure, DEFINITION, found),
  };
}

/** Returns the canonical text of the value of a typed literal, or undefined for a literal that does not decode. */
function literalKey(written: unknown): string | undefined {
  try {
    return canonical(literal.decode(written));
  } catch {
    return undefined;
  }
}

/**
 * Reports whether the replay of a stored case decodes to other values than
 * its entry records: other labels, another number of draws, or another
 * value of a draw whose value the entry records. Two values are the same
 * when their typed literals state one value, so the spelling of a number in
 * a file that another implementation wrote does not count, and a recorded
 * -0 differs from a replayed +0. A recorded value that does not decode
 * differs from every value.
 *
 * @param recorded - The draws that the entry records.
 * @param replayed - The run of the stored case.
 * @returns Whether the two differ.
 */
export function differs(
  recorded: readonly Readonly<Record<string, unknown>>[],
  replayed: Execution,
): boolean {
  const draws = drawsOf(replayed.case.draws);
  if (recorded.length !== draws.length) return true;
  return recorded.some((entry, i) => {
    const draw = draws[i] as Record<string, unknown>;
    if (entry["label"] !== draw["label"]) return true;
    if (!("value" in entry)) return false;
    const value = literalKey(entry["value"]);
    return (
      value === undefined || !("value" in draw) || value !== literalKey(draw["value"])
    );
  });
}
