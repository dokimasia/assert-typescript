/**
 * The directory of a property's store, and the files in it.
 *
 * The store of a test is `testdata/prop/<file>/<describe titles>/<title>`,
 * relative to the working directory: the segments of the test file's path,
 * then the titles of its describe blocks and its own title. Each segment
 * escapes, as `%` and two hexadecimal digits, each character that cannot
 * appear in a file name on some system.
 *
 * Every file of the directory whose name ends in `.json` gets one verdict:
 * an entry of the property replays, an entry of another property of the
 * test is left in place, an entry of a later format is noted and skipped,
 * and any other file is damaged.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Fault } from "../matcher/fault.js";
import { type Cleanups, type Seat, testOf } from "../matcher/seat.js";
import type { Choice } from "./engine/choice.js";
import { read } from "./engine/store.js";

/** The directory of the stores of a project's tests, beside testdata/golden. */
const STORE_ROOT = ["testdata", "prop"];

/** The directory of the seed files of the fuzz targets of a project's tests. */
const FUZZ_ROOT = ["testdata", "fuzz"];

/** The characters that some system refuses in a file name, and the escape character. */
const FORBIDDEN = new Set(["%", "/", "\\", ":", "*", "?", '"', "<", ">", "|"]);

/** The control characters, which no file name contains: those below space. */
const FIRST_PRINTABLE = 0x20;

/** An entry of a store that a property replays. */
export interface Stored {
  /** The file's name. */
  readonly name: string;
  /** The minimal case's choices. */
  readonly choices: readonly Choice[];
  /** Each draw of the counterexample, as the entry records it. */
  readonly counterexample: readonly Readonly<Record<string, unknown>>[];
}

/** What a property reads from its store: its entries, oldest first, and the files that it skips. */
export interface Loaded {
  readonly entries: readonly Stored[];
  readonly skipped: readonly string[];
}

/** The claims of the running properties on the entries of their contracts. */
const CLAIMS = new Set<string>();

/**
 * Returns a segment of a path with each character escaped that a file name
 * cannot contain: a forbidden character, a control character, and a dot or a
 * space that ends the segment, which some system drops.
 */
function escaped(segment: string): string {
  const chars = [...segment];
  return chars
    .map((char, i) => {
      const code = char.codePointAt(0) as number;
      const ending = i === chars.length - 1 && (char === "." || char === " ");
      if (!FORBIDDEN.has(char) && code >= FIRST_PRINTABLE && !ending) return char;
      return `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

/** Returns the directory of the test of seat below root, or the empty string for a seat that runs no named test. */
function below(root: readonly string[], seat: Seat): string {
  const path = testOf(seat);
  return path === undefined ? "" : join(...root, ...path.map(escaped));
}

/**
 * Returns the directory of the store of a property on seat: stated, when the
 * store option states one, and otherwise the store of the seat's test. The
 * empty string states no store.
 *
 * @param seat - The seat of the property.
 * @param stated - The directory that the store option states, or undefined.
 * @returns The directory, or the empty string.
 */
export function storeOf(seat: Seat, stated: string | undefined): string {
  return stated ?? below(STORE_ROOT, seat);
}

/**
 * Returns the directory of the seed files of a fuzz target on seat, or the
 * empty string for a seat that runs no named test.
 *
 * @param seat - The seat of the property.
 * @returns The directory, or the empty string.
 */
export function seedsOf(seat: Seat): string {
  return below(FUZZ_ROOT, seat);
}

/**
 * Claims the entries of contract in the store dir for the test of seat
 * until the test ends, and reports false when a property of a running test
 * has claimed them. A property without a store, and a seat without
 * cleanups, claim nothing and report true.
 *
 * @param seat - The seat of the property.
 * @param dir - The store's directory.
 * @param contract - The property's contract.
 * @returns Whether the store grants the claim.
 */
export function claim(seat: Seat, dir: string, contract: string): boolean {
  const cleanups = (seat as Partial<Cleanups>).cleanup;
  if (dir === "" || typeof cleanups !== "function") return true;
  const key = `${dir}\u0000${contract}`;
  if (CLAIMS.has(key)) return false;
  CLAIMS.add(key);
  cleanups.call(seat, () => {
    CLAIMS.delete(key);
  });
  return true;
}

/** Returns the names of the files of dir, or none for a directory that does not exist. */
function filesOf(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Fault(dir, "the store cannot be read", err);
  }
}

/**
 * Returns the entries of contract in the store dir, the oldest first by the
 * date they were found and by file name among one date, with the files that
 * the property skips.
 *
 * @param dir - The store's directory.
 * @param contract - The property's contract.
 * @returns The entries and the skipped files.
 * @throws Fault at the directory, whose reason names each damaged file, and
 *   for a store that cannot be read.
 */
export function load(dir: string, contract: string): Loaded {
  const entries: (Stored & { readonly found: string })[] = [];
  const skipped: string[] = [];
  const damaged: string[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const name of filesOf(dir).sort()) {
    let text: string;
    try {
      text = decoder.decode(readFileSync(join(dir, name)));
    } catch {
      damaged.push(name);
      continue;
    }
    const verdict = read(text, contract);
    if (verdict.verdict === "replay") {
      const parsed = JSON.parse(text) as {
        found: string;
        counterexample: Stored["counterexample"];
      };
      entries.push({
        name,
        choices: verdict.choices,
        counterexample: parsed.counterexample,
        found: parsed.found,
      });
    } else if (verdict.verdict === "skip") {
      skipped.push(name);
    } else if (verdict.verdict === "damaged") {
      damaged.push(name);
    }
  }
  if (damaged.length > 0) {
    throw new Fault(dir, `the store has damaged files: ${damaged.join(", ")}`);
  }
  entries.sort((a, b) => (a.found === b.found ? 0 : a.found < b.found ? -1 : 1));
  return { entries, skipped };
}

/**
 * Writes an entry into the store dir under name, unless a file of that name
 * exists.
 *
 * @param dir - The store's directory.
 * @param name - The entry's file name.
 * @param entry - The entry, a JSON object.
 * @returns Whether the entry was written.
 * @throws Error of the file system for a store that cannot keep it.
 */
export function save(
  dir: string,
  name: string,
  entry: Readonly<Record<string, unknown>>,
): boolean {
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, name), `${JSON.stringify(entry, null, 2)}\n`, {
      flag: "wx",
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
  return true;
}

/**
 * Returns the seed files of a fuzz target in dir, each a fuzzer's input, in
 * the order of their names, or none for a directory that does not exist.
 *
 * @param dir - The directory of the seed files.
 * @returns Each file's name and bytes.
 * @throws Fault at the directory for one that cannot be read.
 */
export function seeds(dir: string): (readonly [name: string, data: Uint8Array])[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()
      .map((name) => [name, Uint8Array.from(readFileSync(join(dir, name)))] as const);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Fault(dir, "the seed files cannot be read", err);
  }
}
