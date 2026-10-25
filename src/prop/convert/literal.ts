// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The TypeScript value of a value that a typed literal decodes to, and the
 * converter of a literal shape.
 */

import { canonical, Fields, Pairs, Variant } from "../engine/value.js";
import { type Converter, refuse } from "./converter.js";

/**
 * Returns the TypeScript value of a value that a typed literal decodes to: a
 * record as a plain object, a map as a Map, a variant as `{ name }` or
 * `{ name, payload }`, and a list element by element.
 *
 * @param value - The decoded value.
 * @returns The TypeScript value.
 */
export function plainOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(plainOf);
  }
  if (value instanceof Fields) {
    return Object.fromEntries(value.fields.map(([name, v]) => [name, plainOf(v)]));
  }
  if (value instanceof Pairs) {
    return new Map(value.items.map(([k, v]) => [plainOf(k), plainOf(v)]));
  }
  if (value instanceof Variant) {
    return value.hasPayload
      ? { name: value.name, payload: plainOf(value.payload) }
      : { name: value.name };
  }
  return value;
}

/** Returns the converter of a literal over decoded values: each converts to its TypeScript value, and back by its canonical text. */
export function literalOf(decoded: readonly unknown[]): Converter {
  const keys = new Map<string, unknown>();
  for (const value of decoded) {
    keys.set(canonical(value), value);
    keys.set(canonical(plainOf(value)), value);
  }
  return {
    to: plainOf,
    back: (value) => {
      const key = canonical(value);
      if (!keys.has(key)) {
        refuse(value, "literal");
      }
      return keys.get(key);
    },
  };
}
