/**
 * Comparison against a recorded file.
 *
 * A golden file holds output a test compares against, so a change to
 * rendering shows up as a diff rather than as a rewritten assertion.
 * Set `DOKIMI_ASSERT_UPDATE_GOLDEN=1` to rewrite the files, and read
 * the diff before you do: an update accepts whatever the code now
 * does, which is the opposite of an assertion.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { equal as compare } from "./matcher/compare.js";
import { settings } from "./matcher/option.js";
import { Mode, report, type Seat } from "./matcher/seat.js";

/** The variable that turns rewriting on. */
export const UPDATE_ENV = "DOKIMI_ASSERT_UPDATE_GOLDEN";

/** Where `match` looks for a golden file named rather than pathed. */
export const GOLDEN_DIR = "testdata";

/** How JSON is written into a golden file. */
const JSON_INDENT = 2;

/** A replacement applied to both sides before they are compared. */
export type Scrubber = (text: string) => string;

const TIMESTAMP =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const HASH = /\b[0-9a-f]{32,128}\b/g;
const RUN_ID = /\brun_[0-9a-zA-Z]{16}\b/g;

/**
 * Whether this run may rewrite its golden files.
 *
 * @returns True when the update variable is set to anything but 0.
 */
export function shouldUpdate(): boolean {
  const set = process.env[UPDATE_ENV] ?? "";
  return set !== "" && set !== "0";
}

/**
 * Replace ISO-8601 and RFC-3339 timestamps.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubTimestamps(): Scrubber {
  return (text) => text.replace(TIMESTAMP, "SCRUBBED_TIMESTAMP");
}

/**
 * Replace hex digests between 32 and 128 characters.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubHashes(): Scrubber {
  return (text) => text.replace(HASH, "SCRUBBED_HASH");
}

/**
 * Replace identifiers shaped like `run_` and sixteen characters.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubRunIds(): Scrubber {
  return (text) => text.replace(RUN_ID, "SCRUBBED_RUN_ID");
}

/**
 * Replace the value of each named JSON field.
 *
 * Matches the field's text rather than parsing, so it works on output
 * that is nearly JSON as well as output that is.
 *
 * @param fields The field names whose values are replaced.
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubJsonFields(...fields: string[]): Scrubber {
  if (fields.length === 0) return (text) => text;

  const names = fields.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`("(?:${names.join("|")})"\\s*:\\s*)"[^"]*"`, "g");
  return (text) => text.replace(pattern, '$1"SCRUBBED"');
}

/** Apply every scrubber, in the order given. */
function scrub(text: string, scrubbers: readonly Scrubber[]): string {
  return scrubbers.reduce((acc, s) => s(acc), text);
}

/** Write content to target, reporting a failure rather than throwing. */
function write(seat: Seat, target: string, content: string): void {
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  } catch (err) {
    seat.fail(`${target}: the golden file could not be written: ${err}`);
  }
}

/**
 * Compare got against the golden file at path.
 *
 * @param seat Where the failure is reported.
 * @param path Where the golden file lives.
 * @param got The output produced.
 * @param update Whether a mismatch rewrites the file instead of failing.
 * @param scrubbers Replacements applied to both sides before comparing.
 * @example
 * golden.matchAt(seat, "testdata/report.txt", render(report),
 *   golden.shouldUpdate(), golden.scrubTimestamps());
 */
export function matchAt(
  seat: Seat,
  path: string,
  got: string,
  update: boolean,
  ...scrubbers: Scrubber[]
): void {
  seat.helper();

  let recorded: string;
  try {
    recorded = readFileSync(path, "utf8");
  } catch {
    if (!update) {
      seat.fail(
        `${path}: the golden file does not exist; set ${UPDATE_ENV}=1 to create it`,
      );
      return;
    }
    write(seat, path, got);
    return;
  }

  const mine = scrub(got, scrubbers);
  const theirs = scrub(recorded, scrubbers);
  if (mine === theirs) return;

  if (update) {
    write(seat, path, got);
    return;
  }
  report(
    seat,
    Mode.Fatal,
    `${path}: output does not match the golden file; ` +
      `read the diff before setting ${UPDATE_ENV}=1\n` +
      `--- want\n${theirs}\n+++ got\n${mine}`,
  );
}

/**
 * Compare got against the golden file of the given name.
 *
 * The name is resolved against `testdata`, so a test names its file
 * rather than repeating a path.
 *
 * @param seat Where the failure is reported.
 * @param name The golden file's name, under testdata.
 * @param got The output produced.
 * @param update Whether a mismatch rewrites the file instead of failing.
 * @param scrubbers Replacements applied to both sides before comparing.
 * @example
 * golden.match(seat, "report.txt", render(report), golden.shouldUpdate());
 */
export function match(
  seat: Seat,
  name: string,
  got: string,
  update: boolean,
  ...scrubbers: Scrubber[]
): void {
  seat.helper();
  matchAt(seat, join(GOLDEN_DIR, name), got, update, ...scrubbers);
}

/**
 * Compare got against one named field of the JSON object at path.
 *
 * Use it where one golden file holds several independent values, one
 * per field, so a failure shows that value's diff rather than the
 * whole file's and two tests updating different fields do not
 * overwrite each other.
 *
 * @param seat Where the failure is reported.
 * @param path Where the golden file lives.
 * @param field The field to compare.
 * @param got The value as JSON text.
 * @param update Whether a mismatch rewrites the file instead of failing.
 * @param scrubbers Replacements applied to both sides before comparing.
 * @example
 * golden.matchJsonField(seat, "testdata/g.json", "items", "[1,2]", false);
 */
export function matchJsonField(
  seat: Seat,
  path: string,
  field: string,
  got: string,
  update: boolean,
  ...scrubbers: Scrubber[]
): void {
  seat.helper();

  let value: unknown;
  try {
    value = JSON.parse(got);
  } catch (err) {
    seat.fail(`${path}: the value given for field "${field}" is not JSON: ${err}`);
    return;
  }

  const document = readObject(seat, path, update);
  if (document === undefined) return;

  if (!Object.hasOwn(document, field)) {
    if (!update) {
      seat.fail(
        `${path}: the golden file has no field "${field}"; ` +
          `set ${UPDATE_ENV}=1 to add it`,
      );
      return;
    }
    document[field] = value;
    write(seat, path, `${JSON.stringify(document, null, JSON_INDENT)}\n`);
    return;
  }

  const mine = scrub(JSON.stringify(value, null, JSON_INDENT), scrubbers);
  const theirs = scrub(JSON.stringify(document[field], null, JSON_INDENT), scrubbers);

  if (update) {
    if (mine !== theirs) {
      document[field] = value;
      write(seat, path, `${JSON.stringify(document, null, JSON_INDENT)}\n`);
    }
    return;
  }
  if (!compare(mine, theirs, settings([]))) {
    report(
      seat,
      Mode.Fatal,
      `${path}: field "${field}" does not match the golden file; ` +
        `read the diff before setting ${UPDATE_ENV}=1\n` +
        `--- want\n${theirs}\n+++ got\n${mine}`,
    );
  }
}

/** Read the JSON object at path, or undefined when the caller must stop. */
function readObject(
  seat: Seat,
  path: string,
  update: boolean,
): Record<string, unknown> | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    if (!update) {
      seat.fail(
        `${path}: the golden file does not exist; set ${UPDATE_ENV}=1 to create it`,
      );
      return undefined;
    }
    return {};
  }

  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (err) {
    seat.fail(`${path}: the golden file is not JSON: ${err}`);
    return undefined;
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    seat.fail(`${path}: the golden file is not a JSON object`);
    return undefined;
  }
  return document as Record<string, unknown>;
}
