/**
 * The record a failing assertion reports, and where it came from.
 *
 * The record is the same in every implementation of the standard. The
 * sentence a person reads is rendered from it and is not standardised,
 * because each language reads its own conventions.
 */

import { dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { show } from "./matcher/inspect.js";

/** The call site a failure came from. */
export interface Where {
  /** The file the assertion was called from. */
  readonly file: string;
  /** The line within it. */
  readonly line: number;
}

/** The fields of a detail that the accessors of a failure record read. */
const WANT = "want";
const GOT = "got";
const CASE_FAILURE = "failure";

/** The failure record that a failing assertion reports, as the definition states it. */
export class Failure {
  /** The assertion's id, as the definition spells it. */
  readonly assertion: string;
  /** The caller's message, unchanged. */
  readonly contract: string;
  /** The fields that the definition declares for the assertion, and no others. */
  readonly detail: Readonly<Record<string, unknown>>;
  /** Where the assertion was called, when the call site could be read. */
  declare readonly where?: Where;

  /**
   * Returns the record of a failure of assertion.
   *
   * @param assertion - The assertion's canonical id.
   * @param contract - The caller's message, unchanged.
   * @param detail - The fields that the assertion declares.
   * @param where - The call site, or undefined when it could not be read.
   */
  constructor(
    assertion: string,
    contract: string,
    detail: Readonly<Record<string, unknown>>,
    where?: Where,
  ) {
    this.assertion = assertion;
    this.contract = contract;
    this.detail = detail;
    if (where !== undefined) this.where = where;
  }

  /**
   * The detail's want. Undefined when the assertion does not declare a
   * want, and null when it declares one whose value is absent.
   */
  get want(): unknown {
    return Object.hasOwn(this.detail, WANT) ? this.detail[WANT] : undefined;
  }

  /** The detail's got, with the same rule as want. */
  get got(): unknown {
    return Object.hasOwn(this.detail, GOT) ? this.detail[GOT] : undefined;
  }

  /**
   * The record of a property's failing case: the minimal case of a
   * counterexample, or the case that the replay of a flaky run
   * contradicted. Undefined for any other failure.
   */
  get caseFailure(): Failure | undefined {
    const held = this.detail[CASE_FAILURE];
    return held instanceof Failure ? held : undefined;
  }
}

/**
 * The order TypeScript names detail fields in, which is want before
 * got and the rest in a fixed reading order. A field not listed here
 * follows these, alphabetically.
 *
 * The standard fixes the record, not the sentence.
 */
const ORDER = [
  "want",
  "got",
  "length",
  "haystack",
  "needle",
  "index",
  "prefix",
  "suffix",
  "pattern",
  "reason",
  "tolerance",
  "low",
  "high",
  "first",
  "second",
  "attempts",
  "last",
  "leaked",
  "field",
] as const;

/** The sentences that a module states for the records of its assertions, by assertion id. */
const SENTENCES = new Map<string, (failure: Failure) => string>();

/**
 * Makes sentence the sentence of the records of assertions, in place of the
 * contract and the list of the detail's fields.
 *
 * @param sentence - Returns the sentence of a record.
 * @param assertions - The ids of the assertions.
 */
export function registerSentence(
  sentence: (failure: Failure) => string,
  ...assertions: readonly string[]
): void {
  for (const id of assertions) SENTENCES.set(id, sentence);
}

/**
 * Turns a record into the sentence a person reads.
 *
 * @param failure - The record to phrase.
 * @returns The sentence that the assertion's module registered, or the
 *   contract, then each field of the detail with its value.
 */
export function render(failure: Failure): string {
  const sentence = SENTENCES.get(failure.assertion);
  if (sentence !== undefined) return sentence(failure);
  const names = Object.keys(failure.detail);
  if (names.length === 0) return failure.contract;

  const known = ORDER.filter((name) => name in failure.detail);
  const rest = names
    .filter((name) => !(ORDER as readonly string[]).includes(name))
    .sort();
  const parts = [...known, ...rest].map(
    (name) => `${name} ${show(failure.detail[name])}`,
  );
  return `${failure.contract}: ${parts.join(", ")}`;
}

/** The directory of this library's modules, whose frames are not the caller's. */
const LIBRARY = dirname(fileURLToPath(import.meta.url)) + sep;

/**
 * The location of a frame of a V8 stack, in parentheses or after `at`: a
 * file, then its line and its column. A frame without a line, such as that
 * of a built-in function, has none.
 */
const FRAME = /(?:\(|^at (?:async )?)(?<file>[^()]+?):(?<line>\d+):\d+\)?$/;

/**
 * Returns the path of a frame's file with the separators of the platform.
 * The file of a frame is a file URL or a path, and a path on Windows can
 * have forward slashes.
 */
function pathOf(file: string): string {
  return normalize(file.startsWith("file://") ? fileURLToPath(file) : file);
}

/**
 * Returns the innermost frame of a V8 stack whose file is outside this
 * library's directory and is no internal module of the runtime.
 *
 * @param stack - The text of a stack, as an error's `stack` states it.
 * @returns The frame's file and line, or undefined when no frame of the
 *   stack has such a file.
 */
export function siteIn(stack: string): Where | undefined {
  for (const line of stack.split("\n").slice(1)) {
    const frame = FRAME.exec(line.trim());
    if (frame === null) continue;
    const { file, line: at } = frame.groups as { file: string; line: string };
    if (file.startsWith("node:")) continue;
    const path = pathOf(file);
    if (path.startsWith(LIBRARY)) continue;
    return { file: path, line: Number(at) };
  }
  return undefined;
}

/**
 * Reads the call site the assertion was written on: the innermost frame
 * whose file is outside this library's directory and is no internal
 * module of the runtime.
 *
 * @returns Where the assertion was called, or undefined when no frame of
 *   the stack has such a file.
 */
export function callSite(): Where | undefined {
  return siteIn(String(new Error("read the call site").stack));
}
