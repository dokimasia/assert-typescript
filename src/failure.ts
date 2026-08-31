/**
 * The record a failing assertion reports, and where it came from.
 *
 * The record is the same shape in every implementation of the
 * standard. The sentence a person reads is rendered from it and is not
 * standardised, because each language reads its own conventions.
 */

/** The call site a failure came from. */
export interface Where {
  /** The file the assertion was called from. */
  readonly file: string;
  /** The line within it. */
  readonly line: number;
}

/** What a failing assertion reports. */
export interface Failure {
  /** The canonical id the definition names. */
  readonly assertion: string;
  /** The caller's message, unchanged. */
  readonly contract: string;
  /** The values named by that assertion's declared fields. */
  readonly detail: Readonly<Record<string, unknown>>;
  /** The call site, absent when the frame could not be read. */
  readonly where?: Where;
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

/** Say one value the way a failure reads it. */
function said(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Turn a record into the sentence a person reads.
 *
 * @param failure - The record to phrase.
 * @returns The contract, then the detail it carries.
 */
export function render(failure: Failure): string {
  const names = Object.keys(failure.detail);
  if (names.length === 0) return failure.contract;

  const known = ORDER.filter((name) => name in failure.detail);
  const rest = names
    .filter((name) => !(ORDER as readonly string[]).includes(name))
    .sort();
  const parts = [...known, ...rest].map(
    (name) => `${name} ${said(failure.detail[name])}`,
  );
  return `${failure.contract}: ${parts.join(", ")}`;
}

/**
 * Read the call site the assertion was written on.
 *
 * V8 gives a stack whose frames name this library until the caller's
 * own file, so the first frame outside src is the one to report.
 *
 * @returns Where the assertion was called, or undefined when the stack
 *   cannot be read.
 */
export function callSite(): Where | undefined {
  const stack = new Error("read the call site").stack;
  if (stack === undefined) return undefined;

  for (const line of stack.split("\n").slice(1)) {
    const at = /\(?(?<file>[^():]+):(?<line>\d+):\d+\)?$/.exec(line.trim());
    const file = at?.groups?.["file"];
    const atLine = at?.groups?.["line"];
    if (file === undefined || atLine === undefined) continue;
    if (file.includes("/dist/") || file.includes("/src/") || file.includes("node:")) {
      continue;
    }
    return { file, line: Number(atLine) };
  }
  return undefined;
}
