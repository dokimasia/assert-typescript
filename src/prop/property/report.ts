// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The verdict of a property's call: a pass, a skip or a failure, with the
 * detail of the run.
 */

import { Mode } from "../../matcher/seat.js";
import type { Running } from "../../matcher/verdict.js";
import { detailJson } from "../detail/json.js";
import { detailOf, type Result, recordOf, resultOf } from "../detail.js";
import type { Outcome } from "../engine/tally.js";
import type { Call } from "../property.js";

/**
 * Reports the outcome as the verdict of the call running. onResult receives
 * the result of the run before the call reports its verdict. A skipped run
 * skips the test of a seat that skips its test.
 *
 * @param running - The call.
 * @param call - The property's call.
 * @param outcome - The outcome of the run.
 * @param onResult - The function of the option onResult, or undefined.
 */
export function reportOutcome(
  running: Running,
  call: Call,
  outcome: Outcome,
  onResult?: (result: Result) => void,
): void {
  const { assertion, contract, where } = call;
  const detail = detailOf(outcome);
  onResult?.(resultOf(outcome, detail));
  if (outcome.kind === "passed") {
    running.passRun(
      Mode.Fatal,
      assertion,
      contract,
      where,
      detailJson(outcome, detail),
    );
    return;
  }
  if (outcome.kind === "skipped") {
    running.skipRun(
      Mode.Fatal,
      assertion,
      contract,
      where,
      detailJson(outcome, detail),
      outcome.reason as string,
    );
    return;
  }
  const { failure, json } = recordOf(outcome, detail, assertion, contract, where);
  running.failRun(Mode.Fatal, failure, json);
}
