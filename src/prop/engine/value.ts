/**
 * Decoded values, and the equality that uniqueness is decided by.
 *
 * The engine's generators decode to plain values: undefined, a boolean, a
 * bigint for an integer, a number for a float, a string, a Uint8Array for
 * bytes, an array for a list, Pairs for a dict, and Fields and Variant for
 * the record and enum shapes. canonical gives every value a text that two
 * values share exactly when they are equal, with floats compared by their
 * bits.
 */

import { bitsOf, NAN_BITS } from "./float.js";

/** A decoded dict: its entries in the order they were generated. No two keys are equal under canonical. */
export class Pairs {
  /** The entries, each a key and a value. */
  readonly items: readonly (readonly [key: unknown, value: unknown])[];

  /**
   * Returns the dict of items.
   *
   * @param items - The entries, in order.
   */
  constructor(items: readonly (readonly [unknown, unknown])[]) {
    this.items = items;
  }
}

/** A decoded record: each field's name and value, in declaration order. No two fields share a name. */
export class Fields {
  /** The fields, each a name and a value. */
  readonly fields: readonly (readonly [name: string, value: unknown])[];

  /**
   * Returns the record of fields.
   *
   * @param fields - The fields, in order.
   */
  constructor(fields: readonly (readonly [string, unknown])[]) {
    this.fields = fields;
  }
}

/**
 * A decoded variant of an enum: its name, and its payload when it has one.
 * A variant with an optional payload that is absent has a payload of
 * undefined, and hasPayload set.
 */
export class Variant {
  /** The variant's name. */
  readonly name: string;
  /** The payload, when hasPayload is set. */
  readonly payload: unknown;
  /** Whether the variant has a payload. */
  readonly hasPayload: boolean;

  /**
   * Returns the variant name, with a payload when one is given.
   *
   * @param name - The variant's name.
   * @param payload - The payload. A variant without a payload passes none.
   */
  constructor(name: string, ...payload: [] | [unknown]) {
    this.name = name;
    this.hasPayload = payload.length === 1;
    this.payload = payload[0];
  }
}

/** The ids that canonical gives the values it cannot compare by value. */
const IDENTITIES = new WeakMap<WeakKey, number>();
let lastIdentity = 0;

/** Returns the id of an object, a function or a symbol that canonical compares by identity. */
function identityOf(value: WeakKey): string {
  let id = IDENTITIES.get(value);
  if (id === undefined) {
    lastIdentity += 1;
    id = lastIdentity;
    IDENTITIES.set(value, id);
  }
  return `identity:${id}`;
}

/** Returns the canonical text of each element of values, sorted. */
function sorted(values: Iterable<string>): string {
  return [...values].sort().join(",");
}

/** Returns the canonical text of an object. */
function canonicalObject(value: object): string {
  if (value instanceof Uint8Array) return `bytes:${Buffer.from(value).toString("hex")}`;
  if (Array.isArray(value)) return `list:[${value.map(canonical).join(",")}]`;
  if (value instanceof Pairs) {
    return `map:{${sorted(value.items.map(([k, v]) => `${canonical(k)}=${canonical(v)}`))}}`;
  }
  if (value instanceof Map) {
    return `map:{${sorted([...value].map(([k, v]) => `${canonical(k)}=${canonical(v)}`))}}`;
  }
  if (value instanceof Set) return `set:{${sorted([...value].map(canonical))}}`;
  if (value instanceof Fields) {
    return `record:[${value.fields.map(([n, v]) => `${JSON.stringify(n)}=${canonical(v)}`).join(",")}]`;
  }
  if (value instanceof Variant) {
    const payload = value.hasPayload ? `=${canonical(value.payload)}` : "";
    return `variant:${JSON.stringify(value.name)}${payload}`;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype === Object.prototype || prototype === null) {
    const fields = Object.entries(value).map(
      ([n, v]) => `${JSON.stringify(n)}=${canonical(v)}`,
    );
    return `object:{${fields.join(",")}}`;
  }
  const text = Object.prototype.toString.call(value);
  if (text.startsWith("[object Temporal.") || value instanceof Date) {
    return `${text}:${String(value)}`;
  }
  return identityOf(value);
}

/**
 * Returns the canonical text of a value: two values have one text exactly
 * when they are equal. A float compares by its bits, so -0 differs from +0
 * and every NaN is one value. A bigint and a number are of different types.
 * A dict and a Map compare by their entries in any order, a Set by its
 * elements in any order, and a record and a plain object by their fields in
 * order. A date or time value of Temporal compares by its type and its
 * text. A function, a symbol and any other object compare by identity.
 *
 * @param value - The value.
 * @returns Its text.
 */
export function canonical(value: unknown): string {
  switch (typeof value) {
    case "undefined":
      return "null";
    case "boolean":
      return `bool:${value}`;
    case "bigint":
      return `int:${value}`;
    case "number":
      return `float:${Number.isNaN(value) ? NAN_BITS : bitsOf(value)}`;
    case "string":
      return `string:${JSON.stringify(value)}`;
    case "object":
      return value === null ? "null" : canonicalObject(value);
    case "symbol": {
      const key = Symbol.keyFor(value);
      return key === undefined ? identityOf(value) : `symbol:${JSON.stringify(key)}`;
    }
    default:
      return identityOf(value as WeakKey);
  }
}
