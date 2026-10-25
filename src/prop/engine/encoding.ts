// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The canonical typed literal of a decoded value, and the JSON form of a
 * scalar inside it.
 */

import { type Literal, SAFE_INTEGER } from "./literal.js";
import { canonical, Fields, Pairs, Variant } from "./value.js";

/** Returns the scalar type that a value encodes as, or undefined for any other value. */
function scalarKind(value: unknown): string | undefined {
  switch (typeof value) {
    case "boolean":
      return "bool";
    case "bigint":
      return "int";
    case "number":
      return "float";
    case "string":
      return "string";
    default:
      return undefined;
  }
}

/**
 * Returns a scalar's JSON form: the non-finite floats by name, and the
 * integers beyond 2^53 − 1 in magnitude as decimal strings.
 *
 * @param value - A boolean, a bigint, a number or a string.
 * @returns The JSON value.
 */
export function plain(value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return "NaN";
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? "Inf" : "-Inf";
    }
    return value;
  }
  if (typeof value === "bigint") {
    const magnitude = value < 0n ? -value : value;
    return magnitude > SAFE_INTEGER ? value.toString() : Number(value);
  }
  return value;
}

/**
 * Returns the canonical typed literal of a decoded value.
 *
 * @param value - A value that a generator decodes.
 * @returns The literal.
 * @throws TypeError for a value that no generator decodes.
 */
export function encode(value: unknown): Literal {
  if (value === undefined || value === null) {
    return { type: "null" };
  }
  if (value instanceof Uint8Array) {
    return { type: "bytes", value: Buffer.from(value).toString("hex") };
  }
  if (Array.isArray(value)) {
    const kinds = new Set(value.map(scalarKind));
    const [kind] = kinds;
    if (value.length > 0 && kinds.size === 1 && kind !== undefined) {
      return { type: "list", of: kind, value: value.map(plain) };
    }
    return { type: "list", items: value.map(encode) };
  }
  if (value instanceof Pairs) {
    return {
      type: "map",
      entries: value.items.map(([k, v]) => [encode(k), encode(v)]),
    };
  }
  if (value instanceof Fields) {
    return { type: "record", fields: value.fields.map(([n, v]) => [n, encode(v)]) };
  }
  if (value instanceof Variant) {
    return value.hasPayload
      ? { type: "variant", name: value.name, payload: encode(value.payload) }
      : { type: "variant", name: value.name };
  }
  const kind = scalarKind(value);
  if (kind === undefined) {
    throw new TypeError(`prop: ${canonical(value)} is no decoded value`);
  }
  return { type: kind, value: plain(value) };
}
