// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The outputs of the token and store vectors: the replay token of choices,
 * and the store entry that replays a failing case. A stored case of the
 * settings of a vector states the choices and the counterexample of its
 * entry.
 */

import { Fault } from "../../matcher/fault.js";
import { compareText } from "../../order.js";
import type { Choice } from "../../prop/engine/choice.js";
import * as store from "../../prop/engine/store.js";
import * as token from "../../prop/engine/token.js";
import { choiceLiteral, parseChoices } from "./choices.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** A stored case of the settings of a vector: the choices and the counterexample of its entry. */
export interface StoredCase {
  readonly choices: Choice[];
  readonly counterexample: readonly Raw[];
}

/**
 * Returns the stored case at position i of the settings of a vector.
 *
 * @param written - The JSON value of the stored case.
 * @param i - Its position among the stored cases.
 * @returns The stored case.
 * @throws Fault at the stored case for a value that is no object of its
 *   choices and its counterexample.
 */
export function storedCaseOf(written: unknown, i: number): StoredCase {
  const fields =
    typeof written === "object" && written !== null && !Array.isArray(written)
      ? (written as Raw)
      : undefined;
  if (
    fields === undefined ||
    Object.keys(fields).sort(compareText).join() !== "choices,counterexample" ||
    !Array.isArray(fields["counterexample"])
  ) {
    throw new Fault(
      `settings.stored[${i}]`,
      "the stored case is no object of its choices and its counterexample",
    );
  }
  return {
    choices: parseChoices(fields["choices"]),
    counterexample: fields["counterexample"] as readonly Raw[],
  };
}

/** Returns the token of a token vector's choices, or the choices that its token decodes to. */
export function tokenOf(raw: Raw): Record<string, unknown> {
  if ("choices" in raw) {
    return { token: token.encode(parseChoices(raw["choices"])) };
  }
  try {
    return {
      decoded: token.decode(String(raw["token"])).map(choiceLiteral),
      error: false,
    };
  } catch {
    return { decoded: null, error: true };
  }
}

/**
 * Returns the entry that a store vector writes and its name, or the verdict
 * on its text.
 *
 * @throws Fault at `entry` for an entry that does not read back as a replay
 *   of its choices.
 */
export function storeOf(raw: Raw): Record<string, unknown> {
  const contract = String(raw["contract"]);
  if ("text" in raw) {
    const verdict = store.read(String(raw["text"]), contract);
    const replay = verdict.verdict === "replay";
    return {
      verdict: verdict.verdict,
      choices: replay ? verdict.choices.map(choiceLiteral) : null,
    };
  }
  const choices = parseChoices(raw["choices"]);
  const failure: store.Failure = {
    contract,
    choices,
    identity: raw["identity"] as Readonly<Record<string, string | number>>,
    counterexample: raw["counterexample"] as readonly Raw[],
  };
  const written = store.entry(failure, String(raw["definition"]), String(raw["found"]));
  const back = store.read(JSON.stringify(written), contract);
  if (
    back.verdict !== "replay" ||
    token.encode(back.choices) !== token.encode(choices)
  ) {
    throw new Fault("entry", "the entry does not read back as a replay of its choices");
  }
  return { name: store.name(contract, choices), entry: written };
}
