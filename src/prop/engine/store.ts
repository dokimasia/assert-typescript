/**
 * The store: the format of an entry, its name, and what a runner does with
 * one.
 *
 * The store keeps the minimal failing case of each identity in a directory
 * of each test, one JSON object per file. This module states the object
 * that a runner writes, the file's name, and the verdict that a runner gives
 * each file it reads. The directory and the file system are the property's.
 *
 * A name is the entry's key: mix applied to the contract's UTF-8 bytes, a
 * zero byte and the replay token's bytes, as 16 lowercase hexadecimal digits
 * followed by `.json`. The same failure, shrunk to the same choices, has the
 * same name in every language.
 *
 * An entry of format 1 is an object with exactly these fields: `store`, the
 * format; `definition`, the definition version that wrote the entry, as
 * MAJOR.MINOR.PATCH; `property`, the property's contract; `identity`, the
 * failure's identity; `choices`, the replay token of the minimal case;
 * `counterexample`, one object per draw with its `label` and, when the value
 * has a typed literal, its `value`; and `found`, the UTC date on which the
 * runner wrote the entry. A file nests objects and arrays at most 64 levels
 * deep, the root object being the first level.
 *
 * A runner gives each file one verdict: `replay` for an entry of the
 * property, `other` for an entry of another property of the test, `skip`
 * for an entry of a later format or whose token is of a later version, and
 * `damaged` for any other file.
 */

import type { Choice } from "./choice.js";
import { JsonError, parse } from "./json.js";
import { mix } from "./source.js";
import { decode, encode } from "./token.js";

/** The format of the entries that this module writes and replays. */
const FORMAT = 1n;

/** The version of the tokens that the token module encodes. */
const TOKEN_VERSION = 1n;

/** The largest line of an identity, the largest signed 32-bit integer. */
const LINE_MAX = 2n ** 31n - 1n;

/** The most levels of objects and arrays that a file nests, the root included. */
export const MAX_DEPTH = 64;

/** The levels above a draw's value: the root, the counterexample and the draw. */
const ABOVE_VALUE = 3;

/** The fields of an entry of format 1, sorted. */
const FIELDS = [
  "choices",
  "counterexample",
  "definition",
  "found",
  "identity",
  "property",
  "store",
];

/**
 * The keys of an identity, sorted, one set for each way a case fails: an
 * assertion's record with a location, one without a location, a message to
 * the case, and a raised error.
 */
const IDENTITIES = [
  ["assertion", "file", "line"],
  ["assertion", "contract"],
  ["file", "line"],
  ["error", "file", "line"],
].map((keys) => keys.join(","));

/** The keys of a draw of the counterexample, sorted, without and with a value. */
const DRAWS = new Set(["label", "label,value"]);

/** The start of a token, which states its version. */
const TOKEN = /^prop([1-9][0-9]*):/;

/** A definition version and a date. */
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/** What a runner does with one file of the store. */
export type Verdict = "replay" | "other" | "skip" | "damaged";

/** A file's verdict, and for replay the choices of its entry. */
export interface Read {
  readonly verdict: Verdict;
  readonly choices: readonly Choice[];
}

/** A property's minimal failing case, as an entry records it. */
export interface Failure {
  /** The property's contract. */
  readonly contract: string;
  /** The minimal case's choices. */
  readonly choices: readonly Choice[];
  /** The identity, with the keys of one of the four identity shapes. */
  readonly identity: Readonly<Record<string, string | number>>;
  /** Each draw: its label, and its value's typed literal when it has one. */
  readonly counterexample: readonly Readonly<Record<string, unknown>>[];
}

/** The signal that an entry is of a later format or token version. */
class Later extends Error {}

/**
 * Returns the file name of the entry for a contract and a minimal case.
 *
 * @param contract - The property's contract.
 * @param choices - The minimal case's choices.
 * @returns The name, 16 lowercase hexadecimal digits and `.json`.
 */
export function name(contract: string, choices: readonly Choice[]): string {
  const data = Buffer.concat([
    Buffer.from(contract, "utf8"),
    Buffer.of(0),
    Buffer.from(encode(choices), "utf8"),
  ]);
  return `${mix(data).toString(16).padStart(16, "0")}.json`;
}

/** Returns the levels of objects and arrays that node nests, 0 for a scalar. */
function depth(node: unknown): number {
  if (Array.isArray(node)) return 1 + Math.max(0, ...node.map(depth));
  if (typeof node === "object" && node !== null) {
    return 1 + Math.max(0, ...Object.values(node).map(depth));
  }
  return 0;
}

/**
 * Returns the entry that a runner of definition writes on the date found. A
 * draw whose value would nest the entry past 64 levels is recorded by its
 * label alone.
 *
 * @param failure - The failure.
 * @param definition - The definition version, as MAJOR.MINOR.PATCH.
 * @param found - The UTC date, as YYYY-MM-DD.
 * @returns The entry, a JSON object.
 */
export function entry(
  failure: Failure,
  definition: string,
  found: string,
): Record<string, unknown> {
  return {
    store: Number(FORMAT),
    definition,
    property: failure.contract,
    identity: { ...failure.identity },
    choices: encode(failure.choices),
    counterexample: failure.counterexample.map((draw) =>
      "value" in draw && depth(draw["value"]) > MAX_DEPTH - ABOVE_VALUE
        ? { label: draw["label"] }
        : { ...draw },
    ),
    found,
  };
}

/** Reports whether value is a JSON object, as the strict reader returns one. */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the sorted keys of an object, joined by commas. */
function keysOf(value: Readonly<Record<string, unknown>>): string {
  return Object.keys(value).sort().join(",");
}

/** Reports whether value has the form of an identity's key. */
function identityValue(key: string, value: unknown): boolean {
  if (key === "line")
    return typeof value === "bigint" && value >= 1n && value <= LINE_MAX;
  if (typeof value !== "string" || value === "") return false;
  return key !== "file" || !(value.includes("/") || value.includes("\\"));
}

/** Reports whether found is a calendar date written as YYYY-MM-DD, from 0001-01-01 to 9999-12-31. */
function isDate(found: unknown): boolean {
  const match = typeof found === "string" ? DATE.exec(found) : null;
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (lengths[month - 1] as number)
  );
}

/** Reports whether every field of an entry of format 1 has its form. The token's own form is checked apart. */
function wellFormed(document: Readonly<Record<string, unknown>>): boolean {
  const identity = document["identity"];
  const draws = document["counterexample"];
  return (
    typeof document["definition"] === "string" &&
    VERSION.test(document["definition"]) &&
    typeof document["property"] === "string" &&
    isObject(identity) &&
    IDENTITIES.includes(keysOf(identity)) &&
    Object.entries(identity).every(([key, value]) => identityValue(key, value)) &&
    typeof document["choices"] === "string" &&
    Array.isArray(draws) &&
    draws.every(
      (draw) =>
        isObject(draw) && DRAWS.has(keysOf(draw)) && typeof draw["label"] === "string",
    ) &&
    isDate(document["found"])
  );
}

/** Returns the property and the choices of the entry that text states. */
function parseEntry(text: string): readonly [string, Choice[]] {
  const document = parse(text, MAX_DEPTH);
  const version = isObject(document) ? document["store"] : undefined;
  if (typeof version !== "bigint" || version < FORMAT) {
    throw new JsonError("prop: store names no format");
  }
  if (version > FORMAT) throw new Later();
  const entryOf = document as Readonly<Record<string, unknown>>;
  if (keysOf(entryOf) !== FIELDS.join(",") || !wellFormed(entryOf)) {
    throw new JsonError("prop: the entry's fields are not those of its format");
  }
  const token = entryOf["choices"] as string;
  const stated = TOKEN.exec(token);
  if (stated === null) throw new JsonError("prop: the token states no version");
  if (BigInt(stated[1] as string) > TOKEN_VERSION) throw new Later();
  return [entryOf["property"] as string, decode(token)];
}

/**
 * Returns what a runner of the property contract does with a file's text.
 *
 * @param text - The file's text.
 * @param contract - The property's contract.
 * @returns The verdict, and for replay the choices of the entry.
 */
export function read(text: string, contract: string): Read {
  let parsed: readonly [string, Choice[]];
  try {
    parsed = parseEntry(text);
  } catch (err) {
    return { verdict: err instanceof Later ? "skip" : "damaged", choices: [] };
  }
  const [property, choices] = parsed;
  if (property !== contract) return { verdict: "other", choices: [] };
  return { verdict: "replay", choices };
}
