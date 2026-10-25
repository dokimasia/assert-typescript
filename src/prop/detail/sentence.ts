// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The sentence of a failed property's record, which a seat without records
 * reads: the outcome, a line for each part of the detail, and the notes of
 * the failing case.
 */

import { basename } from "node:path";
import { type Failure, registerSentence, render } from "../../failure.js";
import { show } from "../../matcher/inspect.js";
import type { Divergence, Entry, Other, Shortfall } from "../detail.js";
import { REPLAY_VARIABLE } from "../environment.js";

/** The notes of the failing case of each record of a failed run. */
const NOTES = new WeakMap<Failure, readonly string[]>();

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
  if (side !== null) {
    return typeof side === "string" ? side : show(side, DIGITS);
  }
  return {
    request: "no request",
    fingerprint: "no fingerprint",
    verdict: "no failure",
  }[what];
}

/**
 * Keeps the notes of the failing case of a record, which its sentence
 * states after the detail.
 *
 * @param failure - The record.
 * @param notes - The notes of the failing case.
 */
export function keepNotes(failure: Failure, notes: readonly string[]): void {
  NOTES.set(failure, notes);
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
  for (const entry of (d["counterexample"] as readonly Entry[] | null) ?? []) {
    text += entryLine(entry);
  }
  const { caseFailure } = failure;
  if (caseFailure !== undefined) {
    text += failureLine("failure", caseFailure);
  }
  if (typeof d["choices"] === "string") {
    text += replayLine(d["choices"]);
  }
  for (const other of (d["others"] as readonly Other[] | null) ?? []) {
    text += failureLine("other failure", other.failure);
    for (const entry of other.counterexample) {
      text += entryLine(entry);
    }
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
  for (const note of NOTES.get(failure) ?? []) {
    text += `\nnote: ${note}`;
  }
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
