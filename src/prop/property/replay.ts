// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The options of a property that state a case to replay: the token of the
 * option replay, and the entries of the option draws. A fault of an entry is
 * at the entry, under draws.
 */

import { Fault } from "../../matcher/fault.js";
import type { Step } from "../engine/case/record.js";
import type { Choice } from "../engine/choice.js";
import * as literal from "../engine/literal.js";
import * as token from "../engine/token.js";
import { type Entry, isStep, type TraceError } from "../engine/trace.js";
import { tokenOf } from "../environment.js";
import type { Config } from "../option.js";

/** The option that states the entries of a case, at the front of the location of a fault in them. */
const DRAWS = "draws";

/** Reports whether value is a JSON object. */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the step entry that an entry of the draws option states. */
function stepOf(entry: Readonly<Record<string, unknown>>, at: string): Step {
  const client = entry["client"];
  if (
    client !== undefined &&
    !(Number.isSafeInteger(client) && (client as number) >= 0)
  ) {
    throw new Fault(
      `${at}.client`,
      `the client ${JSON.stringify(client)} is no whole number of 0 or more`,
    );
  }
  return {
    action: entry["step"] as string,
    ...(client === undefined ? {} : { client: client as number }),
    ...(entry["drain"] === true ? { drain: true } : {}),
  };
}

/**
 * Returns the entries of a case that the draws option states: a JSON array
 * of objects, each a step entry, which states the action of a step under
 * step, its client under client and the drain mark as drain: true, or a
 * draw entry, which states a label and a typed literal.
 *
 * @param text - The text of the draws option.
 * @returns The entries.
 * @throws Fault at draws for text that is no array of objects, and at an
 *   entry that states no step and no label or no value, a client that is
 *   no whole number of 0 or more, and a value that is no typed literal.
 */
export function entriesOf(text: string): Entry[] {
  let stated: unknown;
  try {
    stated = JSON.parse(text);
  } catch (err) {
    throw new Fault(DRAWS, "the entries are no JSON array of objects", { cause: err });
  }
  if (!(Array.isArray(stated) && stated.every(isObject))) {
    throw new Fault(DRAWS, "the entries are no JSON array of objects");
  }
  return stated.map((entry, i): Entry => {
    const at = `${DRAWS}[${i}]`;
    if (typeof entry["step"] === "string") {
      return stepOf(entry, at);
    }
    if (typeof entry["label"] !== "string" || !("value" in entry)) {
      throw new Fault(at, "the entry states no step, and no label or no value");
    }
    try {
      return { label: entry["label"], value: literal.decode(entry["value"]) };
    } catch (err) {
      throw new Fault(`${at}.value`, "the value is no typed literal", { cause: err });
    }
  });
}

/**
 * Returns the choices of the token that the run replays, or undefined for a
 * run that replays none.
 *
 * @param config - What the options of the call state.
 * @returns The choices, or undefined.
 * @throws Fault at the source of the token for a token that no encoder
 *   writes.
 */
export function replayOf(config: Config): Choice[] | undefined {
  const stated = tokenOf(config.replay, config.hermetic);
  if (stated === undefined) {
    return undefined;
  }
  try {
    return token.decode(stated.token);
  } catch (err) {
    throw new Fault(stated.source, "no encoder writes the token", { cause: err });
  }
}

/**
 * Returns the fault at the entry of the draws option that the body cannot
 * follow.
 *
 * @param err - The refusal of the trace.
 * @param entries - The entries of the draws option.
 * @returns The fault.
 */
export function refusalOf(err: TraceError, entries: readonly Entry[]): Fault {
  const at = `${DRAWS}[${err.entry}].${err.reason}`;
  const entry = entries[err.entry] as Entry;
  const label = JSON.stringify(err.what);
  if (err.reason === "step") {
    return new Fault(at, `the machine cannot take the step ${label} there`);
  }
  if (err.reason === "value") {
    return new Fault(
      at,
      `the generator of the draw labelled ${label} does not produce the entry's value`,
    );
  }
  const taken = isStep(entry)
    ? `the step entry of ${JSON.stringify(entry.action)}`
    : `the entry labelled ${JSON.stringify(entry.label)}`;
  return new Fault(at, `the draw labelled ${label} takes ${taken}`);
}
