// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The record of a property's run, and its sentence.
 *
 * The record's detail has the eleven fields of prop-for-all: outcome,
 * cases, rejected, seed, counterexample, failure, choices, others,
 * divergence, coverage and reason. A field that the outcome does not use is
 * null. The call record of a property states the same detail as JSON, each
 * drawn value as a typed literal of its generator's type.
 */

import { Failure, type Where } from "../failure.js";
import type { Failing } from "./case.js";
import { detailJson } from "./detail/json.js";
import { keepNotes } from "./detail/sentence.js";
import type { Step as EngineStep } from "./engine/case/record.js";
import type { Bounds } from "./engine/choice.js";
import { plain } from "./engine/encoding.js";
import type { Divergence as EngineDivergence, Execution } from "./engine/execution.js";
import type { Explained } from "./engine/shrink/explain.js";
import type { Kind, Outcome } from "./engine/tally.js";
import { encode } from "./engine/token.js";
import { entries, isStep } from "./engine/trace.js";
import { fromKey, textOf } from "./identity.js";

/** Returns the bounds of a request in the form of the definition's vectors. */
function boundsOf(bounds: Bounds): Record<string, unknown> {
  switch (bounds.kind) {
    case "integer":
      return { kind: "integer", min: plain(bounds.lo), max: plain(bounds.hi) };
    case "float":
      return {
        kind: "float",
        min: plain(bounds.lo),
        max: plain(bounds.hi),
        allow_nan: bounds.allowNan,
        width: bounds.width,
      };
    default:
      return {
        kind: "sequence",
        k: bounds.k,
        min_size: bounds.minSize,
        max_size: bounds.maxSize ?? null,
      };
  }
}

/** Returns what an execution failed with. */
function failingOf(execution: Execution): Failing {
  return execution.failure?.record as Failing;
}

/** Returns the entries of a case, each draw explained where the explanation states it. */
function entriesOf(execution: Execution, explanation: readonly Explained[]): Entry[] {
  let index = 0;
  return entries(execution.case).map((entry): Entry => {
    if (isStep(entry)) {
      return stepOf(entry);
    }
    const explained = explanation[index];
    index += 1;
    const drawn: Drawn = {
      label: entry.label,
      value: entry.value,
      anyValueFails: explained?.anyValueFails ?? null,
    };
    return explained?.nearest === undefined
      ? drawn
      : { ...drawn, nearestPassing: explained.nearest.value };
  });
}

/** Returns a step of a machine as a counterexample states it. */
function stepOf(step: EngineStep): Step {
  return {
    step: step.action,
    ...(step.client === undefined ? {} : { client: step.client }),
    ...(step.drain === true ? { drain: true as const } : {}),
  };
}

/**
 * Returns one side of a divergence as the record states it: the bounds of a
 * request, a fingerprint, the text of a failure's identity, or null for an
 * end, no fingerprint or a case that did not fail.
 */
function sideOf(side: EngineDivergence["recorded"]): unknown {
  if (side === undefined) {
    return null;
  }
  if (typeof side === "bigint") {
    return side;
  }
  if (typeof side === "string") {
    return textOf(fromKey(side));
  }
  return boundsOf(side);
}

/** Returns a divergence as the record states it. */
function divergenceOf(divergence: EngineDivergence): Divergence {
  const { step } = divergence;
  return {
    what: divergence.what,
    index: divergence.index,
    recorded: sideOf(divergence.recorded),
    replayed: sideOf(divergence.replayed),
    label: divergence.label ?? null,
    step:
      step === undefined
        ? null
        : {
            part: step.part,
            position: step.position ?? null,
            action: step.action ?? null,
          },
  };
}

/** The id of the assertion of forAll's record. */
export const FOR_ALL = "prop-for-all";

/** One draw of a counterexample. */
export interface Drawn {
  /** The draw's label. */
  readonly label: string;
  /** The value that the generator decoded. */
  readonly value: unknown;
  /** Whether every value fails at the draw, and null for a draw that the explain phase did not test. */
  readonly anyValueFails: boolean | null;
  /** The value one step towards the target that passes, present for an integer draw whose value matters. */
  readonly nearestPassing?: unknown;
}

/** One step of a machine in a counterexample. */
export interface Step {
  /** The action's name. */
  readonly step: string;
  /** The client of a step of a concurrent section. */
  readonly client?: number;
  /** Whether the step is a step of the drain. */
  readonly drain?: true;
}

/** One entry of a counterexample: a draw or a step. */
export type Entry = Drawn | Step;

/** A further failure that a run found, shrunk to its smallest case. */
export interface Other {
  /** The case's draws and steps. */
  readonly counterexample: readonly Entry[];
  /** The case's failure record. */
  readonly failure: Failure;
  /** The case's replay token. */
  readonly choices: string;
}

/** The first difference between a failing case and its replay. */
export interface Divergence {
  /** What differed: a request, a fingerprint or the verdict. */
  readonly what: "request" | "fingerprint" | "verdict";
  /** The position of the request or the fingerprint, or the choices of the case for a verdict. */
  readonly index: number;
  /** The recorded version, and null for an end, no fingerprint, or a case that did not fail. */
  readonly recorded: unknown;
  /** The replayed version, as recorded states it. */
  readonly replayed: unknown;
  /** The label of the draw that was running, or null. */
  readonly label: string | null;
  /** The part and the step of a machine that was running, or null. */
  readonly step: {
    readonly part: string;
    readonly position: number | null;
    readonly action: string | null;
  } | null;
}

/** A coverage requirement that a run refuted or left unmet. */
export interface Shortfall {
  readonly label: string;
  readonly share: number;
  readonly counted: number;
  readonly valid: number;
  readonly verdict: string;
}

/**
 * The result of one run of a property: the eleven fields of the detail of
 * the run. onResult hands it to a function when the run ends. A field that
 * the outcome does not use is null. The record of the run has the same
 * values, and its call record states the seed as decimal text.
 */
export interface Result {
  /** How the run ended. */
  readonly outcome: Kind;
  /** The number of valid cases. */
  readonly cases: number;
  /** The number of rejected cases. */
  readonly rejected: number;
  /** The seed of the run, which the option seed takes. */
  readonly seed: bigint;
  /** The draws and the steps of the failing case of a counterexample or a flaky run, in request order. */
  readonly counterexample: readonly Entry[] | null;
  /** The failure record of the failing case. */
  readonly failure: Failure | null;
  /** The replay token of a counterexample, which the option replay takes. A counterexample of values has none. */
  readonly choices: string | null;
  /** The other failures of a counterexample. */
  readonly others: readonly Other[] | null;
  /** What differed first in a flaky run. */
  readonly divergence: Divergence | null;
  /** The coverage requirement that the run refuted or left unmet. */
  readonly coverage: Shortfall | null;
  /** The reason of a skipped run. */
  readonly reason: string | null;
}

/**
 * Returns the detail of a run's record, each field with its value, and null
 * for a field that the outcome does not use.
 *
 * @param outcome - The run's outcome.
 * @returns The detail.
 */
export function detailOf(outcome: Outcome): Record<string, unknown> {
  const { failing, shortfall } = outcome;
  const concluded = failing !== undefined;
  const counterexample = outcome.kind === "counterexample";
  return {
    outcome: outcome.kind,
    cases: outcome.cases,
    rejected: outcome.rejected,
    seed: String(outcome.seed),
    counterexample: concluded ? entriesOf(failing, outcome.explanation) : null,
    failure: concluded ? failingOf(failing).failure : null,
    choices: counterexample ? (outcome.token ?? null) : null,
    others: counterexample
      ? outcome.others.map(
          (other): Other => ({
            counterexample: entriesOf(other, []),
            failure: failingOf(other).failure,
            choices: encode(other.case.choices),
          }),
        )
      : null,
    divergence:
      outcome.divergence === undefined ? null : divergenceOf(outcome.divergence),
    coverage:
      shortfall === undefined
        ? null
        : {
            label: shortfall.requirement.label,
            share: shortfall.requirement.share,
            counted: shortfall.counted,
            valid: shortfall.valid,
            verdict: shortfall.verdict,
          },
    reason: outcome.reason ?? null,
  };
}

/**
 * Returns the result of a run. The result shares the values of the detail,
 * and its seed is the bigint of the run.
 *
 * @param outcome - The run's outcome.
 * @param detail - The detail that detailOf returns for the outcome.
 * @returns The result.
 */
export function resultOf(outcome: Outcome, detail: Record<string, unknown>): Result {
  return {
    outcome: outcome.kind,
    cases: outcome.cases,
    rejected: outcome.rejected,
    seed: outcome.seed,
    counterexample: detail["counterexample"] as readonly Entry[] | null,
    failure: detail["failure"] as Failure | null,
    choices: detail["choices"] as string | null,
    others: detail["others"] as readonly Other[] | null,
    divergence: detail["divergence"] as Divergence | null,
    coverage: detail["coverage"] as Shortfall | null,
    reason: detail["reason"] as string | null,
  };
}

/**
 * Returns the record of a run that did not pass. A seat without records
 * reads the sentence that this module registers, which states the failing
 * case's notes after the detail.
 *
 * @param outcome - The run's outcome.
 * @param detail - The detail that detailOf returns for the outcome.
 * @param assertion - The assertion of the record: prop-for-all, or a form's id.
 * @param contract - The property's contract.
 * @param where - The call site of the property.
 * @returns The record, and its detail as the call record states it.
 */
export function recordOf(
  outcome: Outcome,
  detail: Record<string, unknown>,
  assertion: string,
  contract: string,
  where: Where | undefined,
): { readonly failure: Failure; readonly json: Record<string, unknown> } {
  const failure = new Failure(assertion, contract, detail, where);
  keepNotes(failure, outcome.failing?.case.notes ?? []);
  return { failure, json: detailJson(outcome, detail) };
}
