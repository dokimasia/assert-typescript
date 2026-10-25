// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The detail of a property's run as its call record states it: each drawn
 * value as a typed literal of its generator's type, and each failure as its
 * failure record.
 */

import { basename } from "node:path";
import type { Failure } from "../../failure.js";
import { show } from "../../matcher/inspect.js";
import { detail as literalOf, opaque } from "../../record/literal.js";
import type { Divergence, Entry, Other } from "../detail.js";
import type { Drawn as EngineDrawn } from "../engine/case/record.js";
import { plain } from "../engine/encoding.js";
import type { Execution } from "../engine/execution.js";
import type { Outcome } from "../engine/tally.js";
import { drawnLiteral } from "../literal.js";

/** Returns the JSON of a failure record, each value of its detail a typed literal or an opaque one. */
function failureJson(failure: Failure): Record<string, unknown> {
  return {
    assertion: failure.assertion === "" ? null : failure.assertion,
    contract: failure.contract,
    detail: Object.fromEntries(
      Object.entries(failure.detail).map(([name, v]) => [name, literalOf(v)]),
    ),
    where:
      failure.where === undefined
        ? null
        : { file: basename(failure.where.file), line: failure.where.line },
  };
}

/** Returns the JSON of the draws and the steps of a case, each value as its generator states its type. */
function entriesJson(
  drawn: readonly EngineDrawn[],
  listed: readonly Entry[],
  brief: boolean,
): unknown[] {
  let index = 0;
  return listed.map((entry) => {
    if ("step" in entry) {
      return { ...entry };
    }
    const { generator } = drawn[index] as EngineDrawn;
    index += 1;
    const value = drawnLiteral(generator, entry.value) ?? opaque(show(entry.value));
    if (brief) {
      return { label: entry.label, value };
    }
    const nearest =
      "nearestPassing" in entry
        ? (drawnLiteral(generator, entry.nearestPassing) ??
          opaque(show(entry.nearestPassing)))
        : null;
    return {
      label: entry.label,
      value,
      "any-value-fails": entry.anyValueFails,
      "nearest-passing": nearest,
    };
  });
}

/** Returns the JSON of one side of a divergence: a fingerprint as a number or a decimal string, and any other side as it is. */
function sideJson(side: unknown): unknown {
  return typeof side === "bigint" ? plain(side) : side;
}

/**
 * Returns the detail of a run as its call record states it: the counts as
 * numbers, the seed and the token as strings, each drawn value as a typed
 * literal of its generator's type, a failure as its failure record, the
 * bounds of a request in the form of the definition's vectors, and null for
 * a field that the outcome does not use.
 *
 * @param outcome - The run's outcome.
 * @param detail - The detail that detailOf returns for it.
 * @returns The JSON object.
 */
export function detailJson(
  outcome: Outcome,
  detail: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { failing } = outcome;
  const listed = detail["counterexample"] as readonly Entry[] | null;
  const others = detail["others"] as readonly Other[] | null;
  const divergence = detail["divergence"] as Divergence | null;
  return {
    ...detail,
    counterexample:
      listed === null
        ? null
        : entriesJson((failing as Execution).case.draws, listed, false),
    failure:
      detail["failure"] === null ? null : failureJson(detail["failure"] as Failure),
    others:
      others === null
        ? null
        : others.map((other, i) => ({
            failure: failureJson(other.failure),
            counterexample: entriesJson(
              (outcome.others[i] as Execution).case.draws,
              other.counterexample,
              true,
            ),
            choices: other.choices,
          })),
    divergence:
      divergence === null
        ? null
        : {
            ...divergence,
            recorded: sideJson(divergence.recorded),
            replayed: sideJson(divergence.replayed),
          },
  };
}
