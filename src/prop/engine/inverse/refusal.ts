// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The refusals of a value that a generator cannot produce, or whose choices
 * the engine cannot compute.
 */

import { canonical } from "../value.js";

/** A value that a generator cannot produce from any sequence of choices. */
export class CannotInvert extends Error {
  /**
   * Returns the refusal of a value.
   *
   * @param message - Why the generator cannot produce the value.
   * @param options - The error that caused the refusal, as cause, or none.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CannotInvert";
  }
}

/**
 * A value whose choices the engine cannot compute: a generator on the way
 * applies a function that the engine cannot run backwards.
 */
export class NoInverse extends CannotInvert {}

/**
 * Returns the text of a value, for a refusal's message.
 *
 * @param value - The value.
 * @returns Its canonical text.
 */
export function shown(value: unknown): string {
  return canonical(value);
}
