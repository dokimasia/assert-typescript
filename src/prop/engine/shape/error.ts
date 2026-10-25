// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The error of a shape that does not read, and the text of a value in its message. */

/** A shape that does not read: unknown, misstated, or without a finite value. */
export class ShapeError extends Error {
  /**
   * Returns the error of a shape that does not read.
   *
   * @param message - Where the shape is wrong and why.
   * @param options - The error that made the shape fail, as its cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ShapeError";
  }
}

/** Returns the JSON text of a value, for an error's message. */
export function shown(value: unknown): string {
  const json: string | undefined = JSON.stringify(value);
  return json ?? String(value);
}
