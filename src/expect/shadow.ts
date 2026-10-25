// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The comparison of shadow mode: a call of a runner's `toEqual` or
 * `toStrictEqual`, compared with the standard's equality.
 *
 * The runner's verdict stands. A call whose verdict the standard's
 * equality would change appends one JSON line to the log. The line states
 * the test, the file and the line of the call, the matcher, the runner's
 * verdict and the standard's verdict. The comparison skips a call whose
 * values contain an asymmetric matcher, such as `expect.any(Date)`,
 * because the standard's equality cannot read one.
 */

import { appendFileSync } from "node:fs";
import { relative } from "node:path";
import process from "node:process";
import { callSite } from "../failure.js";
import { equal } from "../matcher/compare.js";
import { settings } from "../matcher/option.js";

/** The depth at which the search for an asymmetric matcher stops, the depth of the standard's equality. */
const DEPTH = 100;

/** The relaxations of a call of the standard's equality that states none. */
const STRICT = settings([]);

/** A call of a runner's equality matcher, with the runner's verdict. */
export interface Comparison {
  /** The runner, which names the field of the runner's verdict in the log. */
  readonly runner: "jest" | "vitest";
  /** The full name of the test. */
  readonly test: string;
  /** The matcher. */
  readonly matcher: string;
  /** Whether the call was under `.not`. */
  readonly negated: boolean;
  /** The value given to `expect`. */
  readonly received: unknown;
  /** The value given to the matcher. */
  readonly expected: unknown;
  /** Whether the runner's call passed, with `.not` applied. */
  readonly passed: boolean;
}

/** Reports whether value contains an asymmetric matcher, within the depth of the standard's equality. */
function asymmetric(value: unknown, depth: number, seen: Set<unknown>): boolean {
  if (depth > DEPTH || value === null || typeof value !== "object" || seen.has(value)) {
    return false;
  }
  if (typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function") {
    return true;
  }
  seen.add(value);
  const children =
    value instanceof Map
      ? [...value.keys(), ...value.values()]
      : value instanceof Set
        ? [...value]
        : Object.values(value);
  return children.some((child) => asymmetric(child, depth + 1, seen));
}

/**
 * Makes sure that log can take lines, by appending nothing to it.
 *
 * @param log - The path of the log.
 * @throws Error that names the path when the file cannot be appended to.
 */
export function open(log: string): void {
  try {
    appendFileSync(log, "");
  } catch (err) {
    throw new Error(`register: shadow mode cannot append to ${log}`, { cause: err });
  }
}

/**
 * Appends the line of call to log when the standard's equality gives the
 * call another verdict than the runner gave it.
 *
 * @param log - The path of the log.
 * @param call - The call.
 * @returns Whether the verdicts differ.
 */
export function compare(log: string, call: Comparison): boolean {
  const seen = new Set<unknown>();
  if (asymmetric(call.received, 0, seen) || asymmetric(call.expected, 0, seen)) {
    return false;
  }
  const standard = equal(call.received, call.expected, STRICT) !== call.negated;
  if (standard === call.passed) return false;
  const where = callSite();
  const line = {
    test: call.test,
    file: where === undefined ? null : relative(process.cwd(), where.file),
    line: where?.line ?? null,
    matcher: call.negated ? `not.${call.matcher}` : call.matcher,
    [call.runner]: call.passed ? "pass" : "fail",
    standard: standard ? "pass" : "fail",
  };
  appendFileSync(log, `${JSON.stringify(line)}\n`);
  return true;
}
