/**
 * Turning a corpus case's typed literals into native values, and
 * comparing a reported value with one that a case states.
 *
 * A case states its arguments in a language-neutral encoding, because
 * the same case has to run in every implementation. This module decodes
 * that encoding into TypeScript's values. JavaScript has one number type,
 * so an int and a float of one value decode to one number. A vector's
 * JSON compares with a call record's JSON through `sameJson`.
 */

import { decode as decodeTree } from "../files/literal.js";
import { treeOf } from "../files/tree.js";

/** One value, as a corpus case states it. */
export interface Literal {
  /** Which of the encoding's types this is. */
  readonly type: string;
  /** The other keys of the literal's form. */
  readonly [key: string]: unknown;
}

/**
 * The floats JSON has no syntax for.
 *
 * The keys are the encoding's own spelling, so they are data rather
 * than identifiers and camelCase would make them wrong.
 */
const NAMED_FLOATS: Record<string, number> = {
  NaN: Number.NaN,
  Inf: Number.POSITIVE_INFINITY,
  "-Inf": Number.NEGATIVE_INFINITY,
};

/** The scalar types a list or map may name as its element type. */
const SCALARS = new Set(["bool", "int", "float", "string"]);

/** The largest integer a number states exactly. */
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Returns one of the three floats JSON cannot spell. */
function named(text: string): number {
  const value = NAMED_FLOATS[text];
  if (value === undefined) throw new Error(`unknown float: ${text}`);
  return value;
}

/**
 * Returns an integer: a JSON number, or a decimal string, which states an
 * integer beyond ±(2^53 − 1). An integer within that range is a number,
 * and any other is a bigint.
 */
function integer(value: unknown): number | bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error(`an int states ${value}, no safe integer`);
    return value;
  }
  if (typeof value === "string" && /^-?[0-9]+$/.test(value)) {
    const big = BigInt(value);
    return big >= -SAFE && big <= SAFE ? Number(big) : big;
  }
  throw new Error(`an int states ${JSON.stringify(value)}`);
}

/** Returns a float: a JSON number, or the name of a float JSON cannot spell. */
function float(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return named(value);
  throw new Error(`a float states ${JSON.stringify(value)}`);
}

/** Returns the value of one element of a scalar list or map, of the type `of`. */
function scalar(of: string, value: unknown): unknown {
  switch (of) {
    case "int":
      return integer(value);
    case "float":
      return float(value);
    case "bool":
      if (typeof value !== "boolean")
        throw new Error(`a bool states ${JSON.stringify(value)}`);
      return value;
    default:
      if (typeof value !== "string")
        throw new Error(`a string states ${JSON.stringify(value)}`);
      return value;
  }
}

/**
 * Refuse a collection whose element type is missing or unknown.
 *
 * An empty collection would decode without ever reading `of`, so a
 * gap in the encoding would pass unnoticed exactly where there is
 * nothing else to catch it.
 */
function elementType(literal: Literal, which: "of" | "key"): string {
  const stated = literal[which];
  if (stated === undefined) {
    throw new Error(`a ${literal.type} states no ${which}`);
  }
  if (typeof stated !== "string" || !SCALARS.has(stated)) {
    throw new Error(
      `a ${literal.type} names ${which} ${String(stated)}, which is not a scalar`,
    );
  }
  return stated;
}

/** Returns the bytes of lowercase hexadecimal text. */
function bytes(value: unknown): Uint8Array {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})*$/.test(value)) {
    throw new Error(`bytes state ${JSON.stringify(value)}, no lowercase hexadecimal`);
  }
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/**
 * The objects of one case's references. Every reference of one id in a
 * case is one object, so the first literal of an id decodes to a new
 * object of its value, and each later one to that object.
 */
export class Objects {
  readonly #byId = new Map<string, unknown>();

  /**
   * Returns the native value a literal states.
   *
   * @param literal - One typed literal of the case.
   * @returns The value, ready to hand to an assertion.
   * @throws When the literal names a type the encoding does not define, or
   *   a form that this language decodes elsewhere. A case that cannot be
   *   decoded must stop the run rather than quietly becoming an empty one.
   */
  decode(literal: Literal): unknown {
    switch (literal.type) {
      case "null":
        return null;
      case "bool":
        return scalar("bool", literal["value"]);
      case "int":
        return integer(literal["value"]);
      case "float":
        return float(literal["value"]);
      case "string":
        return scalar("string", literal["value"]);
      case "bytes":
        return bytes(literal["value"]);
      case "list":
        return this.#list(literal);
      case "map":
        return this.#map(literal);
      case "record":
        return this.#record(literal);
      case "reference":
        return this.#reference(literal);
      case "tree":
        return treeOf(decodeTree(literal));
      default:
        throw new Error(`unknown literal type: ${literal.type}`);
    }
  }

  /** Decodes a list: scalar values of one type, or item literals. */
  #list(literal: Literal): unknown[] | null {
    if ("items" in literal) {
      const items = literal["items"];
      if (!Array.isArray(items))
        throw new Error("a list states items that are not an array");
      return items.map((item) => this.decode(item as Literal));
    }
    const of = elementType(literal, "of");
    const value = literal["value"];
    if (value === null) return null;
    if (!Array.isArray(value))
      throw new Error("a list states a value that is not an array");
    return value.map((element) => scalar(of, element));
  }

  /** Decodes a map into a Map: string keys and scalar values, or entry literals. */
  #map(literal: Literal): Map<unknown, unknown> | null {
    if ("entries" in literal) {
      const entries = literal["entries"];
      if (!Array.isArray(entries))
        throw new Error("a map states entries that are not an array");
      return new Map(
        entries.map((pair) => {
          const [key, value] = pair as [Literal, Literal];
          return [this.decode(key), this.decode(value)];
        }),
      );
    }
    const of = elementType(literal, "of");
    elementType(literal, "key");
    const value = literal["value"];
    if (value === null) return null;
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("a map states a value that is not an object");
    }
    return new Map(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        scalar(of, v),
      ]),
    );
  }

  /** Decodes a record into an object of its fields, in order. */
  #record(literal: Literal): Record<string, unknown> {
    const fields = literal["fields"];
    if (!Array.isArray(fields))
      throw new Error("a record states fields that are not an array");
    return Object.fromEntries(
      fields.map((pair) => {
        const [name, value] = pair as [string, Literal];
        return [name, this.decode(value)];
      }),
    );
  }

  /**
   * Decodes a reference: the object of its id. A reference's value that is
   * no object is boxed, as `Object(1)` is, so it is an object of that value.
   */
  #reference(literal: Literal): unknown {
    const id = literal["id"];
    if (typeof id !== "string") throw new Error("a reference states no id");
    if (this.#byId.has(id)) return this.#byId.get(id);
    const value = this.decode(literal["value"] as Literal);
    const object = typeof value === "object" && value !== null ? value : Object(value);
    this.#byId.set(id, object);
    return object;
  }
}

/**
 * Returns the native value a literal states, as the only literal of its
 * case.
 *
 * @param literal - One typed literal from a corpus case.
 * @returns The value, ready to hand to an assertion.
 */
export function decode(literal: Literal): unknown {
  return new Objects().decode(literal);
}

/** Returns the hexadecimal text of bytes. */
function hex(value: Uint8Array): string {
  return Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Returns the one text of value under the encoding's equality, so a
 * reported value compares with the value that a case states.
 *
 * - A number and a bigint are one kind: an int and a float of one value
 *   have one text. -0 differs from +0, and every NaN is one value.
 * - A list, an array, a typed array and a `Set` list their elements in
 *   order. A `Uint8Array` is bytes.
 * - A `Map` lists its entries in the order of their texts, so two maps of
 *   equal entries have one text.
 * - A record lists its fields in order, each with its name. A boxed
 *   primitive has the text of its value, and a `Date` that of its ISO
 *   8601 string.
 * - A function, a symbol, an error and any value that no literal states
 *   have the empty text, which no stated value has.
 *
 * @param value - A reported or a decoded value.
 * @returns Its text.
 */
export function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  switch (typeof value) {
    case "boolean":
      return `bool:${value}`;
    case "number":
      return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
    case "bigint":
      return `number:${value}`;
    case "string":
      return `string:${JSON.stringify(value)}`;
    case "object":
      return canonicalObject(value);
    default:
      return "";
  }
}

/** Returns the text of a JSON value with the members of each object in the order of their names. */
function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  const members = Object.keys(value)
    .sort()
    .map(
      (name) =>
        `${JSON.stringify(name)}:${sortedJson((value as Record<string, unknown>)[name])}`,
    );
  return `{${members.join(",")}}`;
}

/**
 * Reports whether two JSON values are the same value: the same members of
 * each object in any order, and the same elements of each array in order.
 * A vector states a tree literal as JSON, and a call record compares with
 * it this way.
 *
 * @param a - A JSON value, as JSON parses it.
 * @param b - Another JSON value.
 * @returns True for the same value.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  return sortedJson(a) === sortedJson(b);
}

/** Returns the canonical text of an object, by its kind. */
function canonicalObject(value: object): string {
  if (value instanceof Error || value instanceof Promise || value instanceof RegExp)
    return "";
  if ([Number, String, Boolean, BigInt].some((box) => value instanceof box)) {
    return canonical(value.valueOf());
  }
  if (value instanceof Uint8Array) return `bytes:${hex(value)}`;
  if (value instanceof Date) return canonical(value.toISOString());
  if (Array.isArray(value) || value instanceof Set || ArrayBuffer.isView(value)) {
    const items = Array.from(value as Iterable<unknown>, canonical);
    return `list:[${items.join(",")}]`;
  }
  if (value instanceof Map) {
    const entries = [...value]
      .map(([k, v]) => `${canonical(k)}=${canonical(v)}`)
      .sort();
    return `map:{${entries.join(",")}}`;
  }
  const fields = Object.entries(value).map(
    ([k, v]) => `${JSON.stringify(k)}=${canonical(v)}`,
  );
  return `record:[${fields.join(",")}]`;
}
