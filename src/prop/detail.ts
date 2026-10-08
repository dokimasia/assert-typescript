/**
 * The record of a property's run, and its sentence.
 *
 * The record's detail has the ten fields of prop-for-all: outcome, cases,
 * rejected, seed, counterexample, failure, choices, others, divergence and
 * coverage. A field that the outcome does not use is null. The call record
 * of a property states the same detail as JSON, each drawn value as a typed
 * literal of its generator's type.
 */

import { basename } from "node:path";
import { Failure, registerSentence, render, type Where } from "../failure.js";
import { show } from "../matcher/inspect.js";
import { detail as literalOf, opaque } from "../record/literal.js";
import type { Failing } from "./case.js";
import type { Drawn as EngineDrawn, Step as EngineStep } from "./engine/case.js";
import type { Bounds } from "./engine/choice.js";
import type { Divergence as EngineDivergence, Execution } from "./engine/execution.js";
import { plain } from "./engine/literal.js";
import type { Outcome } from "./engine/runner.js";
import type { Explained } from "./engine/shrink.js";
import { encode } from "./engine/token.js";
import { entries, isStep } from "./engine/trace.js";
import { REPLAY_VARIABLE } from "./environment.js";
import { fromKey, textOf } from "./identity.js";
import { drawnLiteral } from "./literal.js";

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
  /** The recorded version, and null for an end, no fingerprint, or a pass. */
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

/** The notes of the failing case of each record of a failed run. */
const NOTES = new WeakMap<Failure, readonly string[]>();

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
    if (isStep(entry)) return stepOf(entry);
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
 * end, no fingerprint or a pass.
 */
function sideOf(side: EngineDivergence["recorded"]): unknown {
  if (side === undefined) return null;
  if (typeof side === "bigint") return side;
  if (typeof side === "string") return textOf(fromKey(side));
  return boundsOf(side);
}

/** Returns a divergence as the record states it. */
function divergenceOf(divergence: EngineDivergence): Divergence {
  const step = divergence.step;
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

/**
 * Returns the detail of a run's record, each field with its value, and null
 * for a field that the outcome does not use.
 *
 * @param outcome - The run's outcome.
 * @returns The detail.
 */
export function detailOf(outcome: Outcome): Record<string, unknown> {
  const failing = outcome.failing;
  const concluded = failing !== undefined;
  const counterexample = outcome.kind === "counterexample";
  const shortfall = outcome.shortfall;
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
  };
}

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
    if ("step" in entry) return { ...entry };
    const generator = (drawn[index] as EngineDrawn).generator;
    index += 1;
    const value = drawnLiteral(generator, entry.value) ?? opaque(show(entry.value));
    if (brief) return { label: entry.label, value };
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
  const failing = outcome.failing;
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

/**
 * Returns the record of a run that did not pass. A seat without records
 * reads the sentence that this module registers, which states the failing
 * case's notes after the detail.
 *
 * @param outcome - The run's outcome.
 * @param assertion - The assertion of the record: prop-for-all, or a form's id.
 * @param contract - The property's contract.
 * @param where - The call site of the property.
 * @returns The record, and its detail as the call record states it.
 */
export function recordOf(
  outcome: Outcome,
  assertion: string,
  contract: string,
  where: Where | undefined,
): { readonly failure: Failure; readonly json: Record<string, unknown> } {
  const detail = detailOf(outcome);
  const failure = new Failure(assertion, contract, detail, where);
  NOTES.set(failure, outcome.failing?.case.notes ?? []);
  return { failure, json: detailJson(outcome, detail) };
}

/** The rendering of the values of a counterexample and a divergence, which states a bigint as its digits. */
const DIGITS = { digits: true } as const;

/** Returns the line of an entry of a counterexample. */
function entryLine(entry: Entry): string {
  if ("step" in entry) {
    const client = entry.client === undefined ? "" : ` on client ${entry.client}`;
    return `\n  step ${entry.step}${client}${entry.drain === true ? " in the drain" : ""}`;
  }
  const fails = entry.anyValueFails === true ? ", any value fails" : "";
  const nearest =
    "nearestPassing" in entry ? `, ${show(entry.nearestPassing, DIGITS)} passes` : "";
  return `\n  ${entry.label}: ${show(entry.value, DIGITS)}${fails}${nearest}`;
}

/** Returns the line of a failed case's record. */
function failureLine(what: string, failure: Failure): string {
  const of = failure.assertion === "" ? "" : ` of ${failure.assertion}`;
  const at =
    failure.where === undefined
      ? ""
      : ` at ${basename(failure.where.file)}:${failure.where.line}`;
  return `\n${what}${of}${at}: ${render(failure)}`;
}

/** Returns the line that states how to replay the case of token. */
function replayLine(token: string): string {
  return `\nreplay: prop.replay(${JSON.stringify(token)}) or ${REPLAY_VARIABLE}=${token}`;
}

/** Returns the text of one side of a divergence, and the words for its absence. */
function sideText(what: Divergence["what"], side: unknown): string {
  if (side !== null) return typeof side === "string" ? side : show(side, DIGITS);
  return { request: "no request", fingerprint: "no fingerprint", verdict: "a pass" }[
    what
  ];
}

/**
 * Returns the sentence of a failed run's record: the contract, the outcome
 * with the counts and the seed, and a line for each part of the detail that
 * the outcome uses, then the notes of the failing case.
 *
 * @param failure - The record.
 * @returns The sentence.
 */
export function sentence(failure: Failure): string {
  const d = failure.detail;
  let text = `${failure.contract}: ${d["outcome"]} after ${d["cases"]} valid and ${d["rejected"]} rejected cases, seed ${d["seed"]}`;
  for (const entry of (d["counterexample"] as readonly Entry[] | null) ?? [])
    text += entryLine(entry);
  const caseFailure = failure.caseFailure;
  if (caseFailure !== undefined) text += failureLine("failure", caseFailure);
  if (typeof d["choices"] === "string") text += replayLine(d["choices"]);
  for (const other of (d["others"] as readonly Other[] | null) ?? []) {
    text += failureLine("other failure", other.failure);
    for (const entry of other.counterexample) text += entryLine(entry);
    text += replayLine(other.choices);
  }
  const divergence = d["divergence"] as Divergence | null;
  if (divergence !== null) {
    const label =
      divergence.label === null
        ? ""
        : ` (in the draw ${JSON.stringify(divergence.label)})`;
    text += `\ndivergence: the ${divergence.what} at ${divergence.index}${label}, recorded ${sideText(divergence.what, divergence.recorded)}, replayed ${sideText(divergence.what, divergence.replayed)}`;
  }
  const coverage = d["coverage"] as Shortfall | null;
  if (coverage !== null) {
    text += `\ncoverage: ${coverage.verdict}, ${JSON.stringify(coverage.label)} counted ${coverage.counted} of ${coverage.valid} valid cases against a required share of ${coverage.share}`;
  }
  for (const note of NOTES.get(failure) ?? []) text += `\nnote: ${note}`;
  return text;
}

/**
 * Makes sentence the sentence of the records of assertions.
 *
 * @param assertions - The ids of the property assertions.
 */
export function registerSentences(assertions: readonly string[]): void {
  registerSentence(sentence, ...assertions);
}
