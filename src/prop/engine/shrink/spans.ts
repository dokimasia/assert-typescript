// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The passes of the shrinker that change the spans of the best case: they
 * delete spans, runs of siblings and elements of sequences, lift a
 * descendant into its ancestor, set a span to its targets, and sort
 * siblings. Each reports whether it made a candidate the best case.
 */

import type { Span } from "../case/record.js";
import { compareSequences } from "../order.js";
import type { Shrinker } from "../shrink.js";
import type { Work } from "../work.js";
import {
  atTarget,
  children,
  descendants,
  freeStructure,
  groupsOf,
  keysOf,
  largestPower,
  latestFirst,
  type Node,
  parentsOf,
  sequenceDeletions,
  without,
} from "./nodes.js";
import { findInteger } from "./search.js";

/** The fewest siblings that delete-span-chunk deletes at once. delete-span deletes one. */
const SMALLEST_CHUNK = 2;

/** Considers original without count siblings of group from first. */
function* deleteRun(
  shrinker: Shrinker,
  original: readonly Node[],
  group: readonly Span[],
  first: number,
  count: number,
): Work<boolean> {
  if (first + count > group.length) {
    return false;
  }
  const { start } = group[first] as Span;
  const { end } = group[first + count - 1] as Span;
  return yield* shrinker.consider(without(original, start, end));
}

/** Deletes 2^k consecutive siblings, the largest k first, the last chunk first. */
export function deleteSpanChunk(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes } = shrinker;
    for (const group of groupsOf(shrinker.spans)) {
      const count = group.length;
      for (
        let size = largestPower(count);
        size >= SMALLEST_CHUNK;
        size = Math.floor(size / 2)
      ) {
        for (let first = count - size; first >= 0; first -= 1) {
          const { start } = group[first] as Span;
          const { end } = group[first + size - 1] as Span;
          if (start < end) {
            yield without(nodes, start, end);
          }
        }
      }
    }
  });
}

/** Deletes one span, from the span that starts last to the first, and of two that start together the longer first. */
export function deleteSpan(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes } = shrinker;
    for (const span of latestFirst(shrinker.spans)) {
      if (span.start < span.end) {
        yield without(nodes, span.start, span.end);
      }
    }
  });
}

/** Replaces a span by a shorter descendant with the same label. */
export function liftDescendant(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes, spans } = shrinker;
    for (const [index, span] of spans.entries()) {
      for (const inner of descendants(spans, index)) {
        const shorter = inner.end - inner.start < span.end - span.start;
        if (inner.label === span.label && shorter) {
          yield [
            ...nodes.slice(0, span.start),
            ...nodes.slice(inner.start, inner.end),
            ...nodes.slice(span.end),
          ];
        }
      }
    }
  });
}

/**
 * Deletes as long a run of siblings as findInteger finds, at each start.
 * The groups are visited in parentsOf order. Within a group the runs start
 * at the first sibling and move to the last.
 */
export function* deleteSpanRun(shrinker: Shrinker): Work<boolean> {
  let improved = false;
  for (const parent of parentsOf(shrinker.spans)) {
    for (let first = 0; first < children(shrinker.spans, parent).length; first += 1) {
      const original = shrinker.nodes;
      const group = children(shrinker.spans, parent);
      const deleted = (count: bigint) =>
        deleteRun(shrinker, original, group, first, Number(count));
      if ((yield* findInteger(deleted)) > 0n) {
        improved = true;
      }
    }
  }
  return improved;
}

/** Deletes 2^k consecutive elements of a sequence, the largest k first, never below its minSize. */
export function sequenceDelete(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes } = shrinker;
    for (const index of nodes.keys()) {
      yield* sequenceDeletions(nodes, index);
    }
  });
}

/** Deletes two adjacent free structure choices, from the last pair to the first. */
export function deleteStructurePair(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes } = shrinker;
    for (let first = nodes.length - 2; first >= 0; first -= 1) {
      if (
        freeStructure(nodes[first] as Node) &&
        freeStructure(nodes[first + 1] as Node)
      ) {
        yield without(nodes, first, first + 2);
      }
    }
  });
}

/** Sets every choice of one span to its target, for each span in order. */
export function targetSpan(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes } = shrinker;
    for (const span of shrinker.spans) {
      yield [
        ...nodes.slice(0, span.start),
        ...nodes.slice(span.start, span.end).map(atTarget),
        ...nodes.slice(span.end),
      ];
    }
  });
}

/** Swaps adjacent siblings with one label when the later one is smaller. */
export function sortSiblings(shrinker: Shrinker): Work<boolean> {
  return shrinker.sweep(function* () {
    const { nodes } = shrinker;
    for (const group of groupsOf(shrinker.spans)) {
      for (let i = 0; i + 1 < group.length; i += 1) {
        const left = group[i] as Span;
        const right = group[i + 1] as Span;
        const first = nodes.slice(left.start, left.end);
        const second = nodes.slice(right.start, right.end);
        if (
          left.label === right.label &&
          compareSequences(keysOf(second), keysOf(first)) < 0
        ) {
          yield [
            ...nodes.slice(0, left.start),
            ...second,
            ...nodes.slice(left.end, right.start),
            ...first,
            ...nodes.slice(right.end),
          ];
        }
      }
    }
  });
}
