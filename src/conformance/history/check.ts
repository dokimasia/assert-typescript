// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * What the runners of the check vectors of histories share: the named spec
 * and the options of a vector, the call record of a check on a recorder, and
 * the comparison of a call record with the vector.
 */

import {
  budget,
  type History,
  isLinearizable,
  memoLimit,
  type Option,
  type Spec,
  workers,
} from "../../history/index.js";
import { Fault } from "../../matcher/fault.js";
import type { Seat } from "../../matcher/seat.js";
import { compareText } from "../../order.js";
import { Recorder } from "../../seat.js";
import { sameJson } from "../equality.js";
import { SPECS } from "./specs.js";

/** The contract of the check of a linearizable vector. */
const LINEARIZABLE_CONTRACT = "the history of the vector is linearizable";

/** A vector's JSON object. */
export type Raw = Readonly<Record<string, unknown>>;

/**
 * Returns the call record of check on a recorder, as JSON.
 *
 * @param check - The check, which makes one assertion call on its seat.
 * @returns The call record of that call.
 */
export function recordOf(check: (seat: Seat) => void): Raw {
  const recorder = new Recorder();
  check(recorder);
  return JSON.parse(recorder.records[0] as string) as Raw;
}

/**
 * Returns the call record of a check of linearizability of history against
 * spec under options, as JSON.
 *
 * @param history - The history.
 * @param spec - The spec.
 * @param options - The options of the check.
 * @returns The call record.
 */
export function linearizableRecord(
  history: History,
  spec: Spec<unknown>,
  options: readonly Option[],
): Raw {
  return recordOf((seat) =>
    isLinearizable(seat, history, spec, LINEARIZABLE_CONTRACT, ...options),
  );
}

/**
 * Throws a fault for a call record whose verdict or whose detail differs
 * from the vector's.
 *
 * @param call - The call record.
 * @param raw - The vector, which states expect and the detail of a failure.
 * @throws Fault at the member of the vector that the call record contradicts.
 */
export function compareVerdict(call: Raw, raw: Raw): void {
  const expect = raw["expect"];
  if (expect !== "pass" && expect !== "fail") {
    throw new Fault(
      "expect",
      `the vector expects ${JSON.stringify(expect)}, neither pass nor fail`,
    );
  }
  if (call["verdict"] !== expect) {
    throw new Fault(
      "expect",
      `the check ends as ${String(call["verdict"])}, want ${expect}`,
    );
  }
  if (expect === "pass") {
    return;
  }
  const detail = call["detail"] as Raw;
  const stated = raw["detail"] as Raw;
  for (const name of Object.keys(stated).sort(compareText)) {
    if (!(name in detail)) {
      throw new Fault(
        `detail.${name}`,
        `the record states no such field, want ${JSON.stringify(stated[name])}`,
      );
    }
    if (!sameJson(detail[name], stated[name])) {
      throw new Fault(
        `detail.${name}`,
        `the field is ${JSON.stringify(detail[name])}, want ${JSON.stringify(stated[name])}`,
      );
    }
  }
}

/**
 * Returns the options of a check that a vector states.
 *
 * @param raw - The vector, which may state budget, memo-limit and workers.
 * @returns The options.
 * @throws Fault at a member that states no positive integer.
 */
export function optionsOf(raw: Raw): Option[] {
  const options: Option[] = [];
  const stated: [string, (n: number) => Option][] = [
    ["budget", budget],
    ["memo-limit", memoLimit],
    ["workers", workers],
  ];
  for (const [member, option] of stated) {
    const n = raw[member];
    if (n !== undefined) {
      if (!Number.isSafeInteger(n) || (n as number) < 1) {
        throw new Fault(
          member,
          `the ${member} is ${JSON.stringify(n)}, no integer of 1 or more`,
        );
      }
      options.push(option(n as number));
    }
  }
  return options;
}

/**
 * Returns the named spec of a vector.
 *
 * @param raw - The vector, which states spec.
 * @returns The spec.
 * @throws Fault at spec for a name that no spec has.
 */
export function namedSpec(raw: Raw): Spec<unknown> {
  const spec = SPECS.get(String(raw["spec"]));
  if (spec === undefined) {
    throw new Fault("spec", `${JSON.stringify(raw["spec"])} is no named spec`);
  }
  return spec;
}
