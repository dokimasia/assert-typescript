/**
 * The detail of a run, as a property vector states it.
 *
 * The detail has the ten fields of prop-for-all. A field that the outcome
 * does not use is null. The counterexample lists the minimal case's steps
 * and draws, each draw with its typed literal, whether any value fails
 * there, and its nearest passing value.
 */

import type { Step } from "../../prop/engine/case.js";
import type { Divergence, Execution } from "../../prop/engine/execution.js";
import { identityOf } from "../../prop/engine/execution.js";
import * as literal from "../../prop/engine/literal.js";
import type { Outcome } from "../../prop/engine/runner.js";
import type { Explained } from "../../prop/engine/shrink.js";
import { encode } from "../../prop/engine/token.js";
import { entries, isStep } from "../../prop/engine/trace.js";
import { boundsLiteral } from "./choices.js";

/**
 * Returns the corpus form of a step entry.
 *
 * @param step - The step.
 * @returns Its JSON object.
 */
export function stepLiteral(step: Step): Record<string, unknown> {
  return {
    step: step.action,
    ...(step.client === undefined ? {} : { client: step.client }),
    ...(step.drain === true ? { drain: true } : {}),
  };
}

/** Returns a failing case's steps and draws, each draw explained where it was. */
function counterexampleOf(
  failing: Execution,
  explanation: readonly Explained[],
): unknown[] {
  let index = 0;
  return entries(failing.case).map((entry) => {
    if (isStep(entry)) return stepLiteral(entry);
    const explained = explanation[index];
    index += 1;
    const nearest = explained?.nearest;
    return {
      label: entry.label,
      value: literal.encode(entry.value),
      "any-value-fails": explained?.anyValueFails ?? null,
      "nearest-passing": nearest === undefined ? null : literal.encode(nearest.value),
    };
  });
}

/** Returns another failure's identity, steps and draws, and token. */
function otherOf(execution: Execution): Record<string, unknown> {
  return {
    failure: identityOf(execution),
    counterexample: entries(execution.case).map((entry) =>
      isStep(entry)
        ? stepLiteral(entry)
        : { label: entry.label, value: literal.encode(entry.value) },
    ),
    choices: encode(execution.case.choices),
  };
}

/** Returns one side of a divergence: bounds, a fingerprint, an identity or null. */
function versionOf(version: Divergence["recorded"]): unknown {
  if (version === undefined) return null;
  if (typeof version === "bigint") return Number(version);
  if (typeof version === "string") return version;
  return boundsLiteral(version);
}

/** Returns a divergence in corpus form: its versions, its label and its step. */
function divergenceOf(divergence: Divergence): Record<string, unknown> {
  const step = divergence.step;
  return {
    what: divergence.what,
    index: divergence.index,
    recorded: versionOf(divergence.recorded),
    replayed: versionOf(divergence.replayed),
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
 * Returns the detail fields of a run's outcome, each field that the outcome
 * does not use null.
 *
 * @param outcome - The outcome.
 * @returns The detail, a JSON object.
 */
export function detail(outcome: Outcome): Record<string, unknown> {
  const failing = outcome.failing;
  const concluded =
    failing !== undefined &&
    (outcome.kind === "counterexample" || outcome.kind === "flaky");
  const shortfall = outcome.shortfall;
  const counterexample = outcome.kind === "counterexample";
  return {
    outcome: outcome.kind,
    cases: outcome.cases,
    rejected: outcome.rejected,
    seed: String(outcome.seed),
    counterexample: concluded ? counterexampleOf(failing, outcome.explanation) : null,
    failure: concluded ? identityOf(failing) : null,
    choices: counterexample ? (outcome.token ?? null) : null,
    others: counterexample ? outcome.others.map(otherOf) : null,
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
