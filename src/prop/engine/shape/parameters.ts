// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The parameters of a shape's node: integers, counts, sizes, time units,
 * bounds, alphabets and lists of named shapes. Each function throws a
 * ShapeError that names where a parameter is when it cannot read the
 * parameter.
 */

import * as alphabet from "../alphabet.js";
import { IntegerBounds } from "../choice.js";
import { Sizes } from "../collection.js";
import * as literal from "../literal.js";
import { ShapeError, shown } from "./error.js";
import type { Pair } from "./pair.js";

/** The milliseconds, the microseconds and the nanoseconds in a second. */
const MILLISECONDS = 1_000n;
const MICROSECONDS = 1_000_000n;
const NANOSECONDS = 1_000_000_000n;

/** The units of a time shape, by name, as the count of them in a second. */
const UNITS: ReadonlyMap<string, bigint> = new Map([
  ["s", 1n],
  ["ms", MILLISECONDS],
  ["us", MICROSECONDS],
  ["ns", NANOSECONDS],
]);

/** Compares two pairs as Python compares tuples. */
function comparePairs(a: Pair, b: Pair): number {
  if (a[0] !== b[0]) {
    return a[0] < b[0] ? -1 : 1;
  }
  if (a[1] !== b[1]) {
    return a[1] < b[1] ? -1 : 1;
  }
  return 0;
}

export { NANOSECONDS };

/** The base of a decimal fraction. */
export const DECIMAL_BASE = 10n;

/** A shape as its JSON states it. */
export type Node = Readonly<Record<string, unknown>>;

/** Returns an integer parameter, as a typed literal states an int. */
export function intParameter(node: Node, key: string, where: string): bigint {
  try {
    return literal.integer(node[key]);
  } catch (err) {
    throw new ShapeError(
      `prop: ${where}.${key} is ${shown(node[key])}, not an integer`,
      { cause: err },
    );
  }
}

/** Returns a count parameter of at least 0, or undefined when the node states none. */
export function countParameter(
  node: Node,
  key: string,
  where: string,
): number | undefined {
  if (node[key] === undefined || node[key] === null) {
    return undefined;
  }
  const value = intParameter(node, key, where);
  if (value < 0n) {
    throw new ShapeError(`prop: ${where}.${key} is ${value}, below 0`);
  }
  return Number(value);
}

/** Returns min_size, 0 by default, and max_size, unbounded by default. */
export function sizesOf(node: Node, where: string): Sizes {
  const lo = countParameter(node, "min_size", where) ?? 0;
  const hi = countParameter(node, "max_size", where);
  if (hi !== undefined && hi < lo) {
    throw new ShapeError(`prop: ${where}: sizes [${lo}, ${hi}] are empty`);
  }
  return new Sizes(lo, hi);
}

/** Returns the units in a second of a time shape's unit. */
export function unitOf(node: Node, where: string): bigint {
  const per = UNITS.get(node["unit"] as string);
  if (per === undefined) {
    throw new ShapeError(
      `prop: ${where}.unit is ${shown(node["unit"])}, not one of ms, ns, s, us`,
    );
  }
  return per;
}

/** Returns the units within a second that the digits of a fraction state. */
export function fractionUnits(
  digits: string | undefined,
  per: bigint,
  where: string,
): bigint {
  if (digits === undefined || digits === "") {
    return 0n;
  }
  const scale = DECIMAL_BASE ** BigInt(digits.length);
  const scaled = BigInt(digits) * per;
  if (scaled % scale !== 0n) {
    throw new ShapeError(`prop: ${where} states a fraction finer than its unit`);
  }
  return scaled / scale;
}

/** Returns the integers that a shape's min and max bound, inside fallback. */
export function rangeOf(
  node: Node,
  where: string,
  fallback: readonly [bigint, bigint],
  parse: (value: unknown) => bigint,
): readonly [bigint, bigint] {
  const lo =
    node["min"] === undefined || node["min"] === null
      ? fallback[0]
      : parse(node["min"]);
  const hi =
    node["max"] === undefined || node["max"] === null
      ? fallback[1]
      : parse(node["max"]);
  if (!(fallback[0] <= lo && lo <= hi && hi <= fallback[1])) {
    throw new ShapeError(
      `prop: ${where} bounds [${lo}, ${hi}] are empty or outside [${fallback[0]}, ${fallback[1]}]`,
    );
  }
  return [lo, hi];
}

/** Returns the bounds of one integer choice that a shape's min and max state. */
export function bounded(
  node: Node,
  where: string,
  fallback: readonly [bigint, bigint],
  parse: (value: unknown) => bigint,
): IntegerBounds {
  const [lo, hi] = rangeOf(node, where, fallback, parse);
  return new IntegerBounds(lo, hi);
}

/** Returns the bounds of a two-choice shape, each a first and a second part. */
export function pairBounds(
  node: Node,
  where: string,
  fallback: readonly [Pair, Pair],
  parse: (value: unknown) => Pair,
): readonly [Pair, Pair] {
  const lo =
    node["min"] === undefined || node["min"] === null
      ? fallback[0]
      : parse(node["min"]);
  const hi =
    node["max"] === undefined || node["max"] === null
      ? fallback[1]
      : parse(node["max"]);
  const inside =
    comparePairs(fallback[0], lo) <= 0 &&
    comparePairs(lo, hi) <= 0 &&
    comparePairs(hi, fallback[1]) <= 0;
  if (!inside) {
    throw new ShapeError(
      `prop: ${where} bounds ${lo} to ${hi} are empty or out of range`,
    );
  }
  return [lo, hi];
}

/** Reports whether value is a JSON object. */
export function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns a stated alphabet's characters, or undefined for the default one, and its size. */
export function alphabetOf(
  node: Node,
  where: string,
): readonly [readonly string[] | undefined, number] {
  const characters = node["alphabet"];
  if (characters === undefined || characters === null) {
    return [undefined, alphabet.SIZE];
  }
  if (typeof characters !== "string" || characters === "") {
    throw new ShapeError(
      `prop: ${where}.alphabet is ${shown(characters)}, not characters`,
    );
  }
  const chars = [...characters];
  if (new Set(chars).size !== chars.length) {
    throw new ShapeError(`prop: ${where}.alphabet repeats a character`);
  }
  if (chars.some((char) => alphabet.indexOf(char) === undefined)) {
    throw new ShapeError(
      `prop: ${where}.alphabet has a lone surrogate, which is no character`,
    );
  }
  return [chars, chars.length];
}

/** Returns a list of name and value pairs with distinct, non-empty names. */
export function pairsOf(
  node: Node,
  key: string,
  where: string,
): (readonly [string, unknown])[] {
  const items = node[key];
  if (!Array.isArray(items) || items.length === 0) {
    throw new ShapeError(
      `prop: ${where}.${key} is ${shown(items)}, not a list of pairs`,
    );
  }
  const pairs: (readonly [string, unknown])[] = [];
  for (const item of items) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string") {
      throw new ShapeError(
        `prop: ${where}.${key} has ${shown(item)}, not a name and a shape`,
      );
    }
    const [name, shape] = item;
    if (name === "" || pairs.some(([known]) => known === name)) {
      throw new ShapeError(
        `prop: ${where}.${key} names ${shown(name)} twice or not at all`,
      );
    }
    pairs.push([name, shape]);
  }
  return pairs;
}
