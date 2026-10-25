// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The outputs of the token and store vectors: the replay token of choices,
 * and the store entry that replays a failing case.
 */

import { Fault } from "../../matcher/fault.js";
import * as store from "../../prop/engine/store.js";
import * as token from "../../prop/engine/token.js";
import { choiceLiteral, parseChoices } from "./choices.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

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
