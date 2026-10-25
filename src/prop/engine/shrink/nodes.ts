// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The choices and the spans of a case as the passes of the shrinker edit
 * them: a node is one recorded choice with its request, and the functions
 * return the candidates that replace, delete and step nodes.
 */

import type { Request } from "../case/providers.js";
import type { Span } from "../case/record.js";
import type { Case } from "../case.js";
import { type Choice, choiceOf, type Value } from "../choice.js";
import type { Key } from "../float.js";
import { choiceKey, compareSequences } from "../order.js";
import { encode } from "../token.js";

/** One recorded choice with its request. */
export interface Node {
  readonly request: Request;
  readonly choice: Choice;
}

/**
 * Returns a case's choices with their requests.
 *
 * @param c - The case.
 * @returns The nodes.
 */
export function nodesOf(c: Case): Node[] {
  return c.choices.map((choice, i) => ({ request: c.requests[i] as Request, choice }));
}

/** Returns the keys of the choices of nodes. */
export function keysOf(nodes: readonly Node[]): Key[] {
  return nodes.map((node) => choiceKey(node.request.bounds, node.choice.value));
}

/** Returns nodes with one choice's value replaced. */
export function replaced(nodes: readonly Node[], index: number, value: Value): Node[] {
  const node = nodes[index] as Node;
  const changed = {
    request: node.request,
    choice: choiceOf(node.request.bounds, value),
  };
  return [...nodes.slice(0, index), changed, ...nodes.slice(index + 1)];
}

/** Returns nodes without the nodes from start up to end. */
export function without(nodes: readonly Node[], start: number, end: number): Node[] {
  return [...nodes.slice(0, start), ...nodes.slice(end)];
}

/** Returns the node with its choice at its target. */
export function atTarget(node: Node): Node {
  return {
    request: node.request,
    choice: choiceOf(node.request.bounds, node.request.bounds.target),
  };
}

/** Returns the spans whose parent is parent, in order. */
export function children(spans: readonly Span[], parent: number | undefined): Span[] {
  return spans.filter((span) => span.parent === parent);
}

/** Returns every parent of a sibling group: the later parents first, then the top. */
export function parentsOf(spans: readonly Span[]): (number | undefined)[] {
  const parents = [
    ...new Set(
      spans.map((span) => span.parent).filter((p): p is number => p !== undefined),
    ),
  ].sort((a, b) => a - b);
  return [...parents.reverse(), ...(spans.length > 0 ? [undefined] : [])];
}

/** Returns the sibling groups, in the order of parentsOf. */
export function groupsOf(spans: readonly Span[]): Span[][] {
  return parentsOf(spans).map((parent) => children(spans, parent));
}

/** Returns the descendants of the span at index, in order. */
export function descendants(spans: readonly Span[], index: number): Span[] {
  const inside = new Set([index]);
  const found: Span[] = [];
  for (let later = index + 1; later < spans.length; later += 1) {
    const span = spans[later] as Span;
    if (span.parent === undefined || !inside.has(span.parent)) {
      break;
    }
    inside.add(later);
    found.push(span);
  }
  return found;
}

/** Returns the spans, from the span that starts last to the first, and of two that start together the longer first. */
export function latestFirst(spans: readonly Span[]): Span[] {
  return [...spans].sort((a, b) => b.start - a.start || b.end - a.end);
}

/** Returns the largest power of two that is count or less, and 0 for 0. */
export function largestPower(count: number): number {
  return count === 0 ? 0 : 2 ** Math.floor(Math.log2(count));
}

/**
 * Returns nodes with the integer at index stepped once towards its target,
 * or undefined for a choice that is no integer and for an integer at its
 * target.
 */
export function steppedAt(nodes: readonly Node[], index: number): Node[] | undefined {
  const node = nodes[index] as Node;
  if (node.request.bounds.kind !== "integer") {
    return undefined;
  }
  const value = node.choice.value as bigint;
  const { target } = node.request.bounds;
  if (value === target) {
    return undefined;
  }
  return replaced(nodes, index, value > target ? value - 1n : value + 1n);
}

/**
 * Yields nodes with 2^k consecutive elements deleted from the sequence
 * choice at index, the largest k first and the last run first, never below
 * its minSize. A choice of another kind yields nothing.
 */
export function* sequenceDeletions(
  nodes: readonly Node[],
  index: number,
): Iterable<Node[]> {
  const node = nodes[index] as Node;
  const { bounds } = node.request;
  if (bounds.kind !== "sequence") {
    return;
  }
  const elements = node.choice.value as readonly number[];
  const count = elements.length;
  const largest = largestPower(count - bounds.minSize);
  for (let size = largest; size >= 1; size = Math.floor(size / 2)) {
    for (let first = count - size; first >= 0; first -= 1) {
      yield replaced(nodes, index, [
        ...elements.slice(0, first),
        ...elements.slice(first + size),
      ]);
    }
  }
}

/**
 * Yields nodes with one element deleted from the sequence choice at index,
 * the last element first, when the sequence is longer than its minSize. A
 * choice of another kind yields nothing.
 */
export function* elementDeletions(
  nodes: readonly Node[],
  index: number,
): Iterable<Node[]> {
  const node = nodes[index] as Node;
  const { bounds } = node.request;
  if (bounds.kind !== "sequence") {
    return;
  }
  const elements = node.choice.value as readonly number[];
  if (elements.length <= bounds.minSize) {
    return;
  }
  for (let position = elements.length - 1; position >= 0; position -= 1) {
    yield replaced(nodes, index, [
      ...elements.slice(0, position),
      ...elements.slice(position + 1),
    ]);
  }
}

/** Reports whether a choice decides structure and allows two values or more. */
export function freeStructure(node: Node): boolean {
  const { bounds } = node.request;
  return (
    node.request.edge !== undefined &&
    bounds.kind === "integer" &&
    bounds.lo < bounds.hi
  );
}

/** Returns the groups of choices that share bounds and a value off the target. */
export function duplicates(nodes: readonly Node[]): number[][] {
  const shared = new Map<string, number[]>();
  nodes.forEach((node, index) => {
    const key = choiceKey(node.request.bounds, node.choice.value);
    const target = choiceKey(node.request.bounds, node.request.bounds.target);
    if (compareSequences([key], [target]) === 0) {
      return;
    }
    const identity = `${node.request.bounds.id}|${encode([node.choice])}`;
    const group = shared.get(identity);
    if (group === undefined) {
      shared.set(identity, [index]);
    } else {
      group.push(index);
    }
  });
  return [...shared.values()].filter((indices) => indices.length > 1);
}

/** The index of the next node after index with the same bounds as the node at index, or undefined. */
export function nextWithBounds(
  nodes: readonly Node[],
  index: number,
): number | undefined {
  const { id } = (nodes[index] as Node).request.bounds;
  for (let j = index + 1; j < nodes.length; j += 1) {
    if ((nodes[j] as Node).request.bounds.id === id) {
      return j;
    }
  }
  return undefined;
}
