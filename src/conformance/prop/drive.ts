// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The run of a forms vector's form: the subjects that the vector names, the
 * values beside them, and the options of the run. A driver calls the form
 * with them.
 */

import { Fault } from "../../matcher/fault.js";
import type { Seat } from "../../matcher/seat.js";
import type * as prop from "../../prop/index.js";
import { SUBJECTS, type Subject } from "../subject.js";
import { FUNCTIONS } from "./function.js";

/** The contract of the run of a forms vector's form. */
export const CONTRACT = "the form of a forms vector";

/** The failure that a failing subject of the error forms returns, and the class that err-as takes. */
export class OwnError extends Error {}

/** The subject's own failure: err-is and err-is-not take it as their sentinel. */
export const OWN = new OwnError("the subject failed for its own reason");

/** One run of a vector's form: its subject kinds, the values beside them, its options, and the integers of its input. */
export interface Run {
  readonly subjects: readonly unknown[];
  readonly args: readonly unknown[];
  readonly options: readonly prop.FormOption[];
  /** Returns a value with each integer in it as an integer of the input. */
  readonly bind: (value: unknown) => unknown;
  /** Returns the integer of decimal text as an integer of the input. */
  readonly integer: (text: string) => unknown;
}

/** Calls a vector's form on seat. */
export type Driver = (seat: Seat, run: Run) => Promise<void>;

/** The predicates over two adjacent items, by subject kind. */
export const PREDICATES: ReadonlyMap<
  string,
  (earlier: unknown, later: unknown) => boolean
> = new Map([
  [
    "ascending",
    (earlier: unknown, later: unknown) => (earlier as number) <= (later as number),
  ],
]);

/** What each subject kind of the error forms returns for an input: its own failure, or null for success. */
export const FAILS: ReadonlyMap<string, (input: unknown) => unknown> = new Map([
  ["returns-ok", () => null],
  ["fails-otherwise", () => OWN],
  ["fails-on-negative", (input: unknown) => ((input as number) < 0 ? OWN : null)],
]);

/** What each subject kind of throws and doesNotThrow does with an input: throws its own failure, or returns. */
export const RAISES: ReadonlyMap<string, (input: unknown) => unknown> = new Map<
  string,
  (input: unknown) => unknown
>([
  ["returns-ok", () => undefined],
  [
    "raises",
    () => {
      throw OWN;
    },
  ],
  [
    "raises-on-negative",
    (input) => {
      if ((input as number) < 0) {
        throw OWN;
      }
    },
  ],
]);

/** Returns what table states for the subject kind at index of a run. */
export function kind<T>(table: ReadonlyMap<string, T>, run: Run, index: number): T {
  const stated = run.subjects[index];
  const found = typeof stated === "string" ? table.get(stated) : undefined;
  if (found === undefined) {
    throw new Fault(
      `subjects[${index}]`,
      `${JSON.stringify(stated)} is no subject that the form takes`,
    );
  }
  return found;
}

/** Returns the function of the input of the subject at index, whose integers are of the input. */
export function fn(run: Run, index: number): (input: unknown) => unknown {
  const f = kind(FUNCTIONS, run, index);
  return (input) => run.bind(f(input));
}

/** Returns the subject that the first subject kind of a run builds, which has every member of members. */
export function subject<K extends keyof Subject>(
  run: Run,
  ...members: K[]
): Subject & Required<Pick<Subject, K>> {
  const [stated] = run.subjects;
  const built = typeof stated === "string" ? SUBJECTS[stated]?.() : undefined;
  if (built === undefined || members.some((member) => built[member] === undefined)) {
    throw new Fault(
      "subjects[0]",
      `${JSON.stringify(stated)} is no subject that the form takes`,
    );
  }
  return built as Subject & Required<Pick<Subject, K>>;
}
