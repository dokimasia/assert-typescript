/**
 * The predicates of the property vectors: the conditions that their bodies
 * and filters state as data.
 *
 * A predicate is a JSON object with a `kind` and its parameters, and
 * `"not": true` negates it:
 *
 * - `always` and `never`.
 * - `equals` value: a value equal to the typed literal value.
 * - `at-least` n: a number at least n.
 * - `divisible-by` n: an integer divisible by n.
 * - `sum-above` n: a list of numbers whose sum is above n.
 * - `length-at-least` n: a list, a string, a byte string or a dict with at
 *   least n elements.
 * - `contains` value: a list with an element equal to the typed literal
 *   value, or a string or a byte string that contains it.
 * - `not-sorted`: a list that is not in ascending order.
 * - `has-duplicate`: a list with two equal elements.
 * - `indexed-above` n: a list whose last element is an index, from 0, into
 *   the elements before it, where the element at the index is a number above
 *   n.
 *
 * Equal means equal under the engine's canonical, and the values are the
 * engine's decoded values: a bigint for an integer and a number for a float.
 */

import * as literal from "../../prop/engine/literal.js";
import { canonical, Pairs } from "../../prop/engine/value.js";

/** A condition on a decoded value. */
export type Predicate = (value: unknown) => boolean;

/** A predicate's JSON object. */
type Spec = Readonly<Record<string, unknown>>;

/** Returns a predicate's numeric parameter: an integer as a bigint, and any other number as itself. */
function numberOf(value: unknown): bigint | number {
  if (typeof value === "number" && !Number.isInteger(value)) return value;
  return literal.integer(value);
}

/** Reports whether value is a decoded number: a bigint or a number. */
function isNumber(value: unknown): value is bigint | number {
  return typeof value === "bigint" || typeof value === "number";
}

/** Returns the sum of the numbers among items: a bigint when every one is a bigint. */
function sumOf(items: readonly unknown[]): bigint | number {
  const numbers = items.filter(isNumber);
  if (numbers.every((item) => typeof item === "bigint")) {
    return numbers.reduce((sum: bigint, item) => sum + (item as bigint), 0n);
  }
  return numbers.reduce((sum: number, item) => sum + Number(item), 0);
}

/** Compares two elements of a list in ascending order: numbers by value, and strings by code point. */
function below(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    const left = [...a].map((c) => c.codePointAt(0) as number);
    const right = [...b].map((c) => c.codePointAt(0) as number);
    for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
      if (left[i] !== right[i]) return (left[i] as number) < (right[i] as number);
    }
    return left.length < right.length;
  }
  return (a as number) < (b as number);
}

/** Reports whether needle is a run of consecutive bytes of haystack. */
function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  return Buffer.from(haystack).includes(Buffer.from(needle));
}

/** Returns the factory of each predicate kind. */
const PREDICATES: ReadonlyMap<string, (spec: Spec) => Predicate> = new Map<
  string,
  (spec: Spec) => Predicate
>([
  ["always", () => () => true],
  ["never", () => () => false],
  [
    "equals",
    (spec) => {
      const key = canonical(literal.decode(spec["value"]));
      return (value) => canonical(value) === key;
    },
  ],
  [
    "at-least",
    (spec) => {
      const n = numberOf(spec["n"]);
      return (value) => isNumber(value) && value >= n;
    },
  ],
  [
    "divisible-by",
    (spec) => {
      const n = literal.integer(spec["n"]);
      return (value) => typeof value === "bigint" && value % n === 0n;
    },
  ],
  [
    "sum-above",
    (spec) => {
      const n = numberOf(spec["n"]);
      return (value) => Array.isArray(value) && sumOf(value) > n;
    },
  ],
  [
    "length-at-least",
    (spec) => {
      const n = Number(literal.integer(spec["n"]));
      return (value) => {
        if (value instanceof Pairs) return value.items.length >= n;
        if (typeof value === "string") return [...value].length >= n;
        return (
          (Array.isArray(value) || value instanceof Uint8Array) && value.length >= n
        );
      };
    },
  ],
  [
    "contains",
    (spec) => {
      const wanted = literal.decode(spec["value"]);
      const key = canonical(wanted);
      return (value) => {
        if (Array.isArray(value)) return value.some((item) => canonical(item) === key);
        if (typeof value === "string" && typeof wanted === "string")
          return value.includes(wanted);
        if (value instanceof Uint8Array && wanted instanceof Uint8Array) {
          return containsBytes(value, wanted);
        }
        return false;
      };
    },
  ],
  [
    "not-sorted",
    () => (value) =>
      Array.isArray(value) &&
      value.some((item, i) => i > 0 && below(item, value[i - 1])),
  ],
  [
    "has-duplicate",
    () => (value) =>
      Array.isArray(value) && new Set(value.map(canonical)).size < value.length,
  ],
  [
    "indexed-above",
    (spec) => {
      const n = numberOf(spec["n"]);
      return (value) => {
        if (!Array.isArray(value) || value.length === 0) return false;
        const index = value.at(-1);
        const earlier = value.slice(0, -1);
        if (
          typeof index !== "bigint" ||
          index < 0n ||
          index >= BigInt(earlier.length)
        ) {
          return false;
        }
        const element = earlier[Number(index)];
        return isNumber(element) && element > n;
      };
    },
  ],
]);

/**
 * Returns the predicate that a spec states.
 *
 * @param spec - The predicate's JSON object.
 * @returns The predicate.
 * @throws Error for a spec that names no predicate or lacks a parameter.
 */
export function predicate(spec: unknown): Predicate {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    throw new Error(`prop: ${JSON.stringify(spec)} is no predicate`);
  }
  const stated = spec as Spec;
  const factory = PREDICATES.get(String(stated["kind"]));
  if (factory === undefined) {
    throw new Error(`prop: ${JSON.stringify(stated["kind"])} names no predicate`);
  }
  const test = factory(stated);
  return stated["not"] === true ? (value) => !test(value) : test;
}
