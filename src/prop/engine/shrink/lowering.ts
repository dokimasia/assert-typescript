// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The passes of the shrinker that move the values of the best case towards
 * their targets: each choice, each element of a sequence, the choices that
 * share a value, and each float. Each reports whether it made a candidate
 * the best case.
 */

import { type FloatBounds, IntegerBounds } from "../choice.js";
import { INTEGRAL_LIMIT } from "../float.js";
import type { Shrinker } from "../shrink.js";
import type { Work } from "../work.js";
import { atTarget, duplicates, type Node, replaced } from "./nodes.js";
import { roundedFloats, search } from "./search.js";

/**
 * Moves integer choices of one value together towards their target: the
 * target first, then a binary search over the value's position in the key
 * order of its bounds.
 */
function* lower(shrinker: Shrinker, indices: readonly number[]): Work<boolean> {
  const { nodes } = shrinker;
  const node = nodes[indices[0] as number] as Node;
  const bounds = node.request.bounds as IntegerBounds;
  const value = node.choice.value as bigint;
  const at = (rank: bigint): Work<boolean> => {
    let moved: readonly Node[] = nodes;
    for (const index of indices) {
      moved = replaced(moved, index, bounds.atRank(rank));
    }
    return shrinker.consider(moved);
  };
  return yield* search(bounds.rank(value), at);
}

/** Returns the number of elements of the sequence choice at index, and 0 for another kind. */
function length(shrinker: Shrinker, index: number): number {
  const { value } = (shrinker.nodes[index] as Node).choice;
  return Array.isArray(value) ? value.length : 0;
}

/** Moves one element of a sequence towards 0. */
function* lowerElement(
  shrinker: Shrinker,
  index: number,
  position: number,
): Work<boolean> {
  const { nodes } = shrinker;
  const elements = (nodes[index] as Node).choice.value as readonly number[];
  const at = (element: bigint): Work<boolean> => {
    const changed = [...elements];
    changed[position] = Number(element);
    return shrinker.consider(replaced(nodes, index, changed));
  };
  return yield* search(BigInt(elements[position] as number), at);
}

/**
 * Moves an integral float towards an integral target, as an integer. The
 * search runs over the integers of the bounds below 2^53 in magnitude, in
 * their key order, and skips a value that the float's width cannot state.
 */
function* lowerFloat(shrinker: Shrinker, index: number): Work<boolean> {
  const { nodes } = shrinker;
  const node = nodes[index] as Node;
  const bounds = node.request.bounds as FloatBounds;
  const value = node.choice.value as number;
  const { target } = bounds;
  const integral =
    Number.isInteger(value) &&
    Number.isInteger(target) &&
    Math.abs(value) < INTEGRAL_LIMIT &&
    Math.abs(target) < INTEGRAL_LIMIT;
  if (!integral) {
    return false;
  }
  const limit = INTEGRAL_LIMIT - 1;
  const integers = new IntegerBounds(
    BigInt(Math.max(Math.ceil(bounds.lo), -limit)),
    BigInt(Math.min(Math.floor(bounds.hi), limit)),
  );
  const at = (rank: bigint): Work<boolean> | false => {
    const candidate = Number(integers.atRank(rank));
    if (!bounds.admits(candidate)) {
      return false;
    }
    return shrinker.consider(replaced(nodes, index, candidate));
  };
  const tried = function* (rank: bigint): Work<boolean> {
    const work = at(rank);
    return work === false ? false : yield* work;
  };
  return yield* search(integers.rank(BigInt(value)), tried);
}

/** Moves each choice towards its target, in order. */
export function* minimizeChoice(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  for (let index = 0; index < shrinker.nodes.length; index += 1) {
    const node = shrinker.nodes[index] as Node;
    const accepted =
      node.request.bounds.kind === "integer"
        ? yield* lower(shrinker, [index])
        : yield* shrinker.consider(
            replaced(shrinker.nodes, index, node.request.bounds.target),
          );
    improved = accepted || improved;
  }
  return improved;
}

/** Moves each element of each sequence towards 0: 0, then a binary search. */
export function* sequenceLower(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  for (let index = 0; index < shrinker.nodes.length; index += 1) {
    for (
      let position = 0;
      index < shrinker.nodes.length && position < length(shrinker, index);
      position += 1
    ) {
      improved = (yield* lowerElement(shrinker, index, position)) || improved;
    }
  }
  return improved;
}

/** Moves every choice that shares a value and bounds towards the target together. */
export function* minimizeDuplicates(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  for (let group = 0; ; group += 1) {
    const groups = duplicates(shrinker.nodes);
    if (group >= groups.length) {
      return improved;
    }
    const indices = groups[group] as number[];
    if (
      (shrinker.nodes[indices[0] as number] as Node).request.bounds.kind === "integer"
    ) {
      improved = (yield* lower(shrinker, indices)) || improved;
    } else {
      let moved: readonly Node[] = shrinker.nodes;
      for (const index of indices) {
        moved = [
          ...moved.slice(0, index),
          atTarget(moved[index] as Node),
          ...moved.slice(index + 1),
        ];
      }
      improved = (yield* shrinker.consider(moved)) || improved;
    }
  }
}

/** Simplifies each float, in order: fewer fractional bits, then a smaller integer. */
export function* floatSimplify(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  for (let index = 0; index < shrinker.nodes.length; index += 1) {
    const node = shrinker.nodes[index] as Node;
    const { bounds } = node.request;
    if (bounds.kind === "float") {
      for (const rounded of roundedFloats(node.choice.value as number, bounds)) {
        if (yield* shrinker.consider(replaced(shrinker.nodes, index, rounded))) {
          improved = true;
          break;
        }
      }
      improved = (yield* lowerFloat(shrinker, index)) || improved;
    }
  }
  return improved;
}
