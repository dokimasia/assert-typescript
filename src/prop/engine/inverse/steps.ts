// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The steps that a generator emits for a value when it runs backwards, and
 * the checks of a step.
 */

import { type Bounds, IntegerBounds, type Value } from "../choice.js";
import type { Generator } from "../generator.js";
import { canonical } from "../value.js";
import { CannotInvert, shown } from "./refusal.js";

/** One emitted choice: the bounds that its request states, and its value. */
export interface Step {
  readonly bounds: Bounds;
  readonly value: Value;
}

/**
 * The steps that a generator emits for a value, and the value that they
 * decode to, which differs from the given value only in the order of a
 * set's elements and a map's entries.
 */
export type Emitted = readonly [steps: Step[], normal: unknown];

/** Returns the steps that a generator emits for a value. */
export type Emit = (generator: Generator<unknown>, value: unknown) => Emitted;

/**
 * Returns the steps that one generator of a kind emits for a value. emit
 * returns the steps of each generator that the generator contains.
 */
export type Emitter = (generator: never, value: unknown, emit: Emit) => Emitted;

/** The bounds of a choice of 0 or 1. */
export const BIT = new IntegerBounds(0n, 1n);

/**
 * Returns a step whose value its bounds admit.
 *
 * @param bounds - The bounds of the choice.
 * @param value - The value of the choice.
 * @returns The step.
 * @throws CannotInvert when the bounds do not admit the value.
 */
export function step(bounds: Bounds, value: unknown): Step {
  if (!bounds.admits(value)) {
    throw new CannotInvert(`prop: ${shown(value)} is outside ${bounds.id}`);
  }
  return { bounds, value: value as Value };
}

/**
 * Returns the first index of a value equal to value.
 *
 * @param values - The values to search.
 * @param value - The value to find.
 * @returns The index.
 * @throws CannotInvert when no value equals value.
 */
export function indexOf(values: readonly unknown[], value: unknown): number {
  const wanted = canonical(value);
  const index = values.findIndex((candidate) => canonical(candidate) === wanted);
  if (index < 0) {
    throw new CannotInvert(`prop: ${shown(value)} is none of the values`);
  }
  return index;
}
