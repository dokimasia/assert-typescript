// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Comparing a reported value with one that a corpus case states, and the
 * JSON of a call record with the JSON that a vector states.
 */

import { compareText } from "../order.js";

/** The radix of hexadecimal text. */
const HEX_RADIX = 16;

/** Returns the hexadecimal text of bytes. */
function hex(value: Uint8Array): string {
  return Array.from(value, (b) => b.toString(HEX_RADIX).padStart(2, "0")).join("");
}

/** Returns the text of a JSON value with the members of each object in the order of their names. */
function sortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(sortedJson).join(",")}]`;
  }
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value);
  }
  const members = Object.keys(value)
    .sort(compareText)
    .map(
      (name) =>
        `${JSON.stringify(name)}:${sortedJson((value as Record<string, unknown>)[name])}`,
    );
  return `{${members.join(",")}}`;
}

/** Returns the canonical text of an object, by its kind. */
function canonicalObject(value: object): string {
  if (value instanceof Error || value instanceof Promise || value instanceof RegExp) {
    return "";
  }
  if ([Number, String, Boolean, BigInt].some((box) => value instanceof box)) {
    return canonical(value.valueOf());
  }
  if (value instanceof Uint8Array) {
    return `bytes:${hex(value)}`;
  }
  if (value instanceof Date) {
    return canonical(value.toISOString());
  }
  if (Array.isArray(value) || value instanceof Set || ArrayBuffer.isView(value)) {
    const items = Array.from(value as Iterable<unknown>, canonical);
    return `list:[${items.join(",")}]`;
  }
  if (value instanceof Map) {
    const entries = [...value]
      .map(([k, v]) => `${canonical(k)}=${canonical(v)}`)
      .sort(compareText);
    return `map:{${entries.join(",")}}`;
  }
  const fields = Object.entries(value).map(
    ([k, v]) => `${JSON.stringify(k)}=${canonical(v)}`,
  );
  return `record:[${fields.join(",")}]`;
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
  if (value === null || value === undefined) {
    return "null";
  }
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
