// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Turning a corpus case's typed literals into native values.
 *
 * A case states its arguments in a language-neutral encoding, because
 * the same case has to run in every implementation. This module decodes
 * that encoding into TypeScript's values. JavaScript has one number type,
 * so an int and a float of one value decode to one number.
 */

import { decode as decodeTree } from "../files/literal.js";
import { treeOf } from "../files/tree.js";

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

/** The text of a decimal integer. */
const DECIMAL = /^-?[0-9]+$/u;

/** The text of bytes: lowercase hexadecimal, two digits per byte. */
const HEX_TEXT = /^(?:[0-9a-f]{2})*$/u;

/** Returns one of the three floats JSON cannot spell. */
function named(text: string): number {
  const value = NAMED_FLOATS[text];
  if (value === undefined) {
    throw new Error(`unknown float: ${text}`);
  }
  return value;
}

/**
 * Returns an integer: a JSON number, or a decimal string, which states an
 * integer beyond ±(2^53 − 1). An integer within that range is a number,
 * and any other is a bigint.
 */
function integer(value: unknown): number | bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`an int states ${value}, no safe integer`);
    }
    return value;
  }
  if (typeof value === "string" && DECIMAL.test(value)) {
    const big = BigInt(value);
    return big >= -SAFE && big <= SAFE ? Number(big) : big;
  }
  throw new Error(`an int states ${JSON.stringify(value)}`);
}

/** Returns a float: a JSON number, or the name of a float JSON cannot spell. */
function float(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return named(value);
  }
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
      if (typeof value !== "boolean") {
        throw new Error(`a bool states ${JSON.stringify(value)}`);
      }
      return value;
    default:
      if (typeof value !== "string") {
        throw new Error(`a string states ${JSON.stringify(value)}`);
      }
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
  if (typeof value !== "string" || !HEX_TEXT.test(value)) {
    throw new Error(`bytes state ${JSON.stringify(value)}, no lowercase hexadecimal`);
  }
  return Uint8Array.from(value.match(/../gu) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
}

/** One value, as a corpus case states it. */
export interface Literal {
  /** Which of the encoding's types this is. */
  readonly type: string;
  /** The other keys of the literal's form. */
  readonly [key: string]: unknown;
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
      if (!Array.isArray(items)) {
        throw new Error("a list states items that are not an array");
      }
      return items.map((item) => this.decode(item as Literal));
    }
    const of = elementType(literal, "of");
    const value = literal["value"];
    if (value === null) {
      return null;
    }
    if (!Array.isArray(value)) {
      throw new Error("a list states a value that is not an array");
    }
    return value.map((element) => scalar(of, element));
  }

  /** Decodes a map into a Map: string keys and scalar values, or entry literals. */
  #map(literal: Literal): Map<unknown, unknown> | null {
    if ("entries" in literal) {
      const entries = literal["entries"];
      if (!Array.isArray(entries)) {
        throw new Error("a map states entries that are not an array");
      }
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
    if (value === null) {
      return null;
    }
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
    if (!Array.isArray(fields)) {
      throw new Error("a record states fields that are not an array");
    }
    return Object.fromEntries(
      fields.map((pair) => {
        const [name, value] = pair as [string, Literal];
        return [name, this.decode(value)];
      }),
    );
  }

  /**
   * Decodes a reference: the object of its id. A reference's value that is
   * no object is boxed, as `new Object(1)` is, so it is an object of that
   * value.
   */
  #reference(literal: Literal): unknown {
    const id = literal["id"];
    if (typeof id !== "string") {
      throw new Error("a reference states no id");
    }
    if (this.#byId.has(id)) {
      return this.#byId.get(id);
    }
    const value = this.decode(literal["value"] as Literal);
    const object =
      typeof value === "object" && value !== null ? value : new Object(value);
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
