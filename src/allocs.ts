// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Whether a run checks allocation ceilings.
 *
 * V8 does not expose an allocation count, so the library declares the
 * definition's allocation ceilings absent, and no run checks one.
 */

/** Why no run of this library checks an allocation ceiling. */
const UNCOUNTED = "V8 does not expose an allocation count";

/**
 * Reports whether a run checks the definition's allocation ceilings, and
 * the reason when it does not. No run of this library checks one, so the
 * result is false with the same reason in every run.
 *
 * @returns checked false, and the reason.
 * @example
 * const { checked, reason } = allocsChecked();
 * if (!checked) console.warn(`the run does not check allocation ceilings: ${reason}`);
 */
export function allocsChecked(): {
  readonly checked: boolean;
  readonly reason: string;
} {
  return { checked: false, reason: UNCOUNTED };
}
