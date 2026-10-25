// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * How the values of one shape convert between the value that the engine
 * decodes and the value that a body receives, and the refusal of a value of
 * neither form.
 */

/** Returns the JSON text of a value, for an error's message. */
function shown(value: unknown): string {
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  const json: string | undefined = JSON.stringify(value);
  return json ?? String(value);
}

/** How the values of one shape convert. */
export interface Converter {
  /** Returns the TypeScript value of a value that the engine decoded from the shape. */
  readonly to: (value: unknown) => unknown;
  /**
   * Returns the engine's value of a TypeScript value of the shape, or of a
   * value of the engine's form.
   *
   * @throws TypeError or RangeError for a value of neither form.
   */
  readonly back: (value: unknown) => unknown;
}

/**
 * The converter of a value that is the same in both forms: a value of a
 * shape whose TypeScript values are the engine's, and a value of a
 * registered generator, which is a TypeScript value already.
 */
export const IDENTITY: Converter = { to: (value) => value, back: (value) => value };

/** Throws a TypeError for a value that is no value of the shape. */
export function refuse(value: unknown, shape: string): never {
  throw new TypeError(`prop: ${shown(value)} is no value of the ${shape} shape`);
}
