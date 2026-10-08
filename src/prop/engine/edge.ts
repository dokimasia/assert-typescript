/**
 * The edge cases: four cases, each with every value at one boundary.
 *
 * A choice that decides structure takes the edge that its request states,
 * so a collection gets one element, a one-of its first alternative and an
 * optional its value. A value choice takes the boundary of its case:
 *
 * - `min`: lo. A sequence's elements are 0.
 * - `max`: hi. A sequence's elements are k − 1.
 * - `above`: one above the target, the next float of the width for a
 *   float, and 1 for a sequence's elements.
 * - `below`: one below the target, and the next float below it.
 *
 * A value that the bounds do not admit takes the target instead. A sequence
 * has one element, or minSize elements when that is more, and none when its
 * maxSize is 0.
 */

import type { Provider, Request } from "./case.js";
import type { FloatBounds, IntegerBounds, SequenceBounds, Value } from "./choice.js";
import { nextDown, nextUp } from "./float.js";

/** The boundary that every value choice of one edge case takes. */
export type Boundary = "min" | "max" | "above" | "below";

/** The edge cases, in the order a run tries them. */
export const BOUNDARIES: readonly Boundary[] = ["min", "max", "above", "below"];

/** Returns an integer choice's value at the boundary. */
function integerAt(bounds: IntegerBounds, boundary: Boundary): bigint {
  const target = bounds.target;
  const values: Readonly<Record<Boundary, bigint>> = {
    min: bounds.lo,
    max: bounds.hi,
    above: target + 1n,
    below: target - 1n,
  };
  const value = values[boundary];
  return bounds.admits(value) ? value : target;
}

/** Returns a float choice's value at the boundary. */
function floatAt(bounds: FloatBounds, boundary: Boundary): number {
  const target = bounds.target;
  const values: Readonly<Record<Boundary, number>> = {
    min: bounds.lo,
    max: bounds.hi,
    above: nextUp(target, bounds.width),
    below: nextDown(target, bounds.width),
  };
  const value = values[boundary];
  return bounds.admits(value) ? value : target;
}

/** Returns a sequence choice's value at the boundary. */
function sequenceAt(bounds: SequenceBounds, boundary: Boundary): readonly number[] {
  let length = Math.max(bounds.minSize, 1);
  if (bounds.maxSize !== undefined) length = Math.min(length, bounds.maxSize);
  const values: Readonly<Record<Boundary, number>> = {
    min: 0,
    max: bounds.k - 1,
    above: 1,
    below: -1,
  };
  const element = values[boundary];
  return new Array<number>(length).fill(
    element >= 0 && element < bounds.k ? element : 0,
  );
}

/** A provider that gives every choice its value at one boundary. */
export class Edge implements Provider {
  readonly #boundary: Boundary;

  /**
   * Returns the provider that gives each value choice its value at boundary.
   *
   * @param boundary - The boundary.
   */
  constructor(boundary: Boundary) {
    this.#boundary = boundary;
  }

  /**
   * Returns the request's edge, or its value at the boundary.
   *
   * @param request - The request.
   * @returns The value.
   */
  value(request: Request): Value {
    const bounds = request.bounds;
    if (request.edge !== undefined) {
      return bounds.admits(request.edge) ? request.edge : bounds.target;
    }
    switch (bounds.kind) {
      case "integer":
        return integerAt(bounds, this.#boundary);
      case "float":
        return floatAt(bounds, this.#boundary);
      default:
        return sequenceAt(bounds, this.#boundary);
    }
  }
}
