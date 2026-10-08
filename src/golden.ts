/**
 * Comparison against recorded output.
 *
 * A golden file contains the output that a test compares with, so a
 * change to rendering shows as a diff rather than as a rewritten
 * assertion. A golden tree is a directory of such files. Set
 * `DOKIMI_ASSERT_UPDATE_GOLDEN=1` to rewrite them, and read the diff
 * before you do: an update accepts whatever the code now does, which is
 * the opposite of an assertion.
 *
 * Each comparison states its own contract, which names the golden file or
 * tree. A failure is a record of the comparison: the golden content as
 * want, null for a missing file, and the output as got, both scrubbed. A
 * golden file that cannot be read or written ends the call with a fault.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { callSite } from "./failure.js";
import { differing } from "./files/difference.js";
import { type Entry, withText } from "./files/entry.js";
import { readTree } from "./files/reader.js";
import { type Comparison, comparison, missing, report } from "./files/record.js";
import { pathFault } from "./files/tree.js";
import { update as updateTree } from "./files/writer.js";
import { Fault, ofOperation } from "./matcher/fault.js";
import { Mode, type Seat } from "./matcher/seat.js";
import { fail, fault, pass, Running } from "./matcher/verdict.js";

/** The variable that turns rewriting on. */
export const UPDATE_ENV = "DOKIMI_ASSERT_UPDATE_GOLDEN";

/** Where `match` and `matchTree` resolve a name, relative to the working directory. */
export const GOLDEN_DIR = join("testdata", "golden");

/** How JSON is written into a golden file. */
const JSON_INDENT = 2;

/** A replacement applied to both sides before they are compared. */
export type Scrubber = (text: string) => string;

const TIMESTAMP =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const HASH = /\b[0-9a-f]{32,128}\b/g;
const RUN_ID = /\brun_[0-9a-zA-Z]{16}\b/g;

/**
 * Reports whether this run may rewrite its golden files.
 *
 * @returns True when the update variable is set to anything but 0.
 */
export function shouldUpdate(): boolean {
  const set = process.env[UPDATE_ENV] ?? "";
  return set !== "" && set !== "0";
}

/**
 * Replaces ISO-8601 and RFC-3339 timestamps.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubTimestamps(): Scrubber {
  return (text) => text.replace(TIMESTAMP, "SCRUBBED_TIMESTAMP");
}

/**
 * Replaces hex digests between 32 and 128 characters.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubHashes(): Scrubber {
  return (text) => text.replace(HASH, "SCRUBBED_HASH");
}

/**
 * Replaces identifiers shaped like `run_` and sixteen characters.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubRunIds(): Scrubber {
  return (text) => text.replace(RUN_ID, "SCRUBBED_RUN_ID");
}

/**
 * Replaces the value of each named JSON field.
 *
 * It matches the field's text rather than parsing, so it works on output
 * that is nearly JSON as well as on output that is.
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

/** Applies every scrubber, in the order given. */
function scrub(text: string, scrubbers: readonly Scrubber[]): string {
  return scrubbers.reduce((acc, s) => s(acc), text);
}

/** One call of a golden comparison: its seat, its assertion, its contract and its file. */
interface Call {
  readonly seat: Seat;
  readonly assertion: string;
  readonly contract: string;
  readonly path: string;
}

/** Returns the call of a comparison of output with the golden file at path. */
function fileCall(seat: Seat, assertion: string, path: string): Call {
  return {
    seat,
    assertion,
    path,
    contract: `the golden file ${path} matches the output, and ${UPDATE_ENV}=1 writes it`,
  };
}

/** Ends the call with a fault that states the file, what failed, and why. */
function faulted(call: Call, what: string, err: unknown): void {
  fault(
    call.seat,
    Mode.Fatal,
    call.assertion,
    call.contract,
    new Fault(call.path, what, err),
  );
}

/** Writes content as the call's golden file, in a directory it creates when missing, and passes. */
function write(call: Call, content: string): void {
  try {
    mkdirSync(dirname(call.path), { recursive: true });
    writeFileSync(call.path, content);
  } catch (err) {
    faulted(call, "the golden file cannot be written", err);
    return;
  }
  pass(call.seat, Mode.Fatal, call.assertion, call.contract);
}

/** Reads the call's golden file, or returns null for a missing one and undefined after a fault. */
function read(call: Call): string | null | undefined {
  try {
    return readFileSync(call.path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    faulted(call, "the golden file cannot be read", err);
    return undefined;
  }
}

/** Compares got with the call's golden file, and reports the verdict. */
function matchFile(
  call: Call,
  got: string,
  update: boolean,
  scrubbers: readonly Scrubber[],
): void {
  const mine = scrub(got, scrubbers);
  const recorded = read(call);
  if (recorded === undefined) return;
  const theirs = recorded === null ? null : scrub(recorded, scrubbers);
  if (mine === theirs) {
    pass(call.seat, Mode.Fatal, call.assertion, call.contract);
    return;
  }
  if (update) {
    write(call, mine);
    return;
  }
  fail(call.seat, Mode.Fatal, call.assertion, call.contract, {
    want: theirs,
    got: mine,
  });
}

/**
 * Compares got with the golden file at path.
 *
 * @param seat Where the failure is reported.
 * @param path The path of the golden file.
 * @param got The output.
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
  matchFile(fileCall(seat, "golden-match-at", path), got, update, scrubbers);
}

/**
 * Compares got with the golden file of the given name.
 *
 * The name resolves against `testdata/golden`, relative to the working
 * directory, so a test names its file rather than repeating a path.
 *
 * @param seat Where the failure is reported.
 * @param name The golden file's name, under testdata/golden.
 * @param got The output.
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
  matchFile(
    fileCall(seat, "golden-match", join(GOLDEN_DIR, name)),
    got,
    update,
    scrubbers,
  );
}

/**
 * Compares got with one named field of the JSON object at path.
 *
 * Use it where one golden file contains several independent values, one
 * per field, so a failure shows that value alone and two tests updating
 * different fields do not overwrite each other. Both sides are parsed
 * and written again with the same indentation first, so formatting
 * differences do not fail. A missing file or field fails while update is
 * false, and an update writes the field and keeps every other one.
 *
 * @param seat Where the failure is reported.
 * @param path The path of the golden file.
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
  const call: Call = {
    seat,
    assertion: "golden-match-json-field",
    path,
    contract:
      `the field ${JSON.stringify(field)} of the golden file ${path} matches the value, ` +
      `and ${UPDATE_ENV}=1 writes it`,
  };

  let value: unknown;
  try {
    value = JSON.parse(got);
  } catch (err) {
    faulted(call, `the value of the field ${JSON.stringify(field)} is no JSON`, err);
    return;
  }
  const mine = scrub(JSON.stringify(value, null, JSON_INDENT), scrubbers);

  const document = readObject(call);
  if (document === undefined) return;

  const present = Object.hasOwn(document, field);
  const theirs = present
    ? scrub(JSON.stringify(document[field], null, JSON_INDENT), scrubbers)
    : null;
  if (mine === theirs) {
    pass(seat, Mode.Fatal, call.assertion, call.contract);
    return;
  }
  if (update) {
    document[field] = value;
    write(call, `${JSON.stringify(document, null, JSON_INDENT)}\n`);
    return;
  }
  fail(seat, Mode.Fatal, call.assertion, call.contract, {
    want: theirs,
    got: mine,
    field,
  });
}

/** Reads the call's golden JSON object, an empty one for a missing file, or undefined after a fault. */
function readObject(call: Call): Record<string, unknown> | undefined {
  const text = read(call);
  if (text === undefined) return undefined;
  if (text === null) return {};

  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (err) {
    faulted(call, "the golden file cannot be read as a JSON object", err);
    return undefined;
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    faulted(call, "the golden file cannot be read as a JSON object", "it is no object");
    return undefined;
  }
  return document as Record<string, unknown>;
}

/** Returns tree with scrubbers applied to the content of each file that is UTF-8 text. */
function scrubbed(
  tree: ReadonlyMap<string, Entry>,
  scrubbers: readonly Scrubber[],
): Map<string, Entry> {
  return new Map(
    [...tree].map(([path, e]) => [
      path,
      e.text === undefined ? e : withText(e, scrub(e.text, scrubbers)),
    ]),
  );
}

/**
 * Compares the tree in dir with the golden tree in golden, and makes the
 * golden tree equal it under update when they differ.
 *
 * @returns The record of the comparison, and undefined when the two trees
 *   are equal.
 */
function compareTree(
  name: string,
  golden: string,
  dir: string,
  update: boolean,
  scrubbers: readonly Scrubber[],
): Comparison | undefined {
  const refused = pathFault(name);
  if (refused !== undefined) throw new Fault("", refused);
  const output = scrubbed(readTree(dir, true), scrubbers);
  const absent = statSync(golden, { throwIfNoEntry: false }) === undefined;
  const recorded = absent
    ? new Map<string, Entry>()
    : scrubbed(readTree(golden, false), scrubbers);
  const paths = differing(recorded, output, false);
  if (update && (absent || paths.length > 0)) updateTree(golden, output);
  return absent ? missing(output) : comparison(recorded, output, paths);
}

/**
 * Compares the tree in dir with the golden tree of the given name.
 *
 * The name resolves against `testdata/golden`, relative to the working
 * directory. It follows the rules of a path of a tree: names joined by
 * slashes, none of them empty, `.` or `..`, so it cannot leave the
 * conventional directory. The comparison follows no link. It reads no mode
 * of the golden tree, and compares the owner's execute bit of each file,
 * the one bit that git records. The scrubbers apply to the content of every
 * file that is UTF-8 text, on both sides.
 *
 * A failure is a record of golden-match-tree: want and got, the trees of
 * the entries at the first 64 paths that differ, and differences, the
 * number of those paths. A missing golden directory fails with want null,
 * got the first 64 entries of the output, and differences the number of
 * its entries.
 *
 * With update, the call makes the golden directory equal the output and
 * passes. It removes each entry that the output lacks, writes each entry
 * that the directory lacks or has in another form, and writes the scrubbed
 * content. It removes a link, and never the entry that the link points to.
 * An update deletes every entry of the golden directory that the output
 * lacks, so a golden directory contains no input of a test.
 *
 * A name that is no path, an entry of either tree that is no file,
 * directory or link, and a tree or a golden directory that cannot be read
 * or written end the call with a fault.
 *
 * @param seat Where the failure is reported.
 * @param name The golden tree's name, under testdata/golden.
 * @param dir The directory of the output, a path of the operating system.
 * @param update Whether a mismatch rewrites the golden tree instead of failing.
 * @param scrubbers Replacements applied to both sides before comparing.
 * @example
 * golden.matchTree(seat, "api", out, golden.shouldUpdate());
 */
export function matchTree(
  seat: Seat,
  name: string,
  dir: string,
  update: boolean,
  ...scrubbers: Scrubber[]
): void {
  seat.helper();
  const golden = join(GOLDEN_DIR, ...name.split("/"));
  const contract = `the golden tree ${golden} matches the output, and ${UPDATE_ENV}=1 writes it`;
  const running = Running.of(seat);
  let record: Comparison | undefined;
  try {
    record = compareTree(name, golden, dir, update, scrubbers);
  } catch (err) {
    running.fault(
      Mode.Fatal,
      "golden-match-tree",
      contract,
      ofOperation("golden.matchTree", err),
    );
    return;
  }
  report(
    running,
    "golden-match-tree",
    contract,
    update ? undefined : record,
    callSite(),
  );
}
