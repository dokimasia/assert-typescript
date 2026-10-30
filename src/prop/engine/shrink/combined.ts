// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The passes of the shrinker that change two parts of the best case at
 * once: a step of an integer with a deletion of a span or an element, and
 * an amount that moves from one integer to another or lowers both. Each
 * reports whether it made a candidate the best case.
 */

import { min } from "../choice.js";
import type { Shrinker } from "../shrink.js";
import type { Work } from "../work.js";
import {
  elementDeletions,
  latestFirst,
  type Node,
  nextWithBounds,
  replaced,
  steppedAt,
  without,
} from "./nodes.js";
import { findInteger } from "./search.js";

/**
 * Steps the integer at index by one, alone and then with a later span
 * deleted, and reports whether a step with a deletion was accepted. When
 * the step alone makes the run record another number of choices, the step
 * is tried with each span that starts after the integer deleted, the span
 * that starts last first.
 */
function* stepAndDelete(shrinker: Shrinker, index: number): Work<boolean> {
  const { nodes } = shrinker;
  const stepped = steppedAt(nodes, index);
  if (stepped === undefined || (yield* shrinker.consider(stepped))) {
    return false;
  }
  const size = shrinker.sizeOf(stepped.map((n) => n.choice));
  if (size === undefined || size === nodes.length) {
    return false;
  }
  const later = latestFirst(
    shrinker.spans.filter((span) => index < span.start && span.start < span.end),
  );
  for (const span of later) {
    if (yield* shrinker.consider(without(stepped, span.start, span.end))) {
      return true;
    }
  }
  return false;
}

/** Moves value from the integer at index to the next one with its bounds: the whole distance, then a binary search. */
function* move(shrinker: Shrinker, index: number): Work<boolean> {
  const { nodes } = shrinker;
  const node = nodes[index] as Node;
  const { bounds } = node.request;
  if (bounds.kind !== "integer") {
    return false;
  }
  const value = node.choice.value as bigint;
  const later = nextWithBounds(nodes, index);
  const { target } = bounds;
  if (later === undefined || value === target) {
    return false;
  }
  const other = (nodes[later] as Node).choice.value as bigint;
  const sign = value > target ? 1n : -1n;
  const moved = (amount: bigint): Work<boolean> | false => {
    const raised = other + sign * amount;
    if (!bounds.admits(raised)) {
      return false;
    }
    return shrinker.consider(
      replaced(replaced(nodes, index, value - sign * amount), later, raised),
    );
  };
  const tried = function* (amount: bigint): Work<boolean> {
    const work = moved(amount);
    return work === false ? false : yield* work;
  };
  const distance = value > target ? value - target : target - value;
  if (yield* tried(distance)) {
    return true;
  }
  let low = 0n;
  let high = distance;
  let improved = false;
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (yield* tried(middle)) {
      low = middle;
      improved = true;
    } else {
      high = middle;
    }
  }
  return improved;
}

/** Moves the integer at index and the next one with its bounds by one amount, when both lie on one side of the target. */
function* lowerPair(shrinker: Shrinker, index: number): Work<boolean> {
  const { nodes } = shrinker;
  const node = nodes[index] as Node;
  const { bounds } = node.request;
  if (bounds.kind !== "integer") {
    return false;
  }
  const value = node.choice.value as bigint;
  const later = nextWithBounds(nodes, index);
  if (later === undefined) {
    return false;
  }
  const other = (nodes[later] as Node).choice.value as bigint;
  const { target } = bounds;
  if (value > target !== other > target || value === target || other === target) {
    return false;
  }
  const step = value > target ? -1n : 1n;
  const distance = (v: bigint) => (v > target ? v - target : target - v);
  const room = min(distance(value), distance(other));

  const moved = function* (amount: bigint): Work<boolean> {
    if (amount > room) {
      return false;
    }
    const lowered = replaced(nodes, index, value + step * amount);
    return yield* shrinker.consider(replaced(lowered, later, other + step * amount));
  };
  return (yield* findInteger(moved)) > 0n;
}

/**
 * Steps each integer towards its target, deleting a later span that it
 * sizes. A step accepted with a deletion is tried again on the same
 * integer, and a step accepted alone moves on to the next integer.
 */
export function* lowerAndDelete(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  let index = 0;
  while (index < shrinker.nodes.length) {
    const before = shrinker.best;
    const deleted = yield* stepAndDelete(shrinker, index);
    improved = improved || shrinker.best !== before;
    if (!deleted) {
      index += 1;
    }
  }
  return improved;
}

/**
 * Steps each integer towards its target with earlier data deleted: one
 * span removed that is not empty and ends at or before the integer, the
 * span that starts last first, then one element removed from an earlier
 * sequence, the last sequence and its last element first.
 */
export function deleteAndLower(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes, spans } = shrinker;
    for (const index of nodes.keys()) {
      const stepped = steppedAt(nodes, index);
      if (stepped !== undefined) {
        const earlier = spans.filter((s) => s.start < s.end && s.end <= index);
        for (const span of latestFirst(earlier)) {
          yield without(stepped, span.start, span.end);
        }
        for (let at = index - 1; at >= 0; at -= 1) {
          yield* elementDeletions(stepped, at);
        }
      }
    }
  });
}

/** Moves value from each integer to the next integer with the same bounds, keeping their sum. */
export function* redistribute(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  for (let index = 0; index < shrinker.nodes.length; index += 1) {
    improved = (yield* move(shrinker, index)) || improved;
  }
  return improved;
}

/** Moves each integer and the next integer with its bounds towards their target by one amount. */
export function* lowerTogether(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  for (let index = 0; index < shrinker.nodes.length; index += 1) {
    improved = (yield* lowerPair(shrinker, index)) || improved;
  }
  return improved;
}
