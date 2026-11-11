// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The strategies of the task scheduler: how it chooses the ready task to
 * release, and the choices of the case that each strategy makes.
 */

import { type Case, onEngine } from "../prop/case.js";
import { IntegerBounds, UINT64_MAX } from "../prop/engine/choice.js";

/** The bounds of a task's priority under PCT, and of the count of a change point. */
const UNSIGNED = new IntegerBounds(0n, UINT64_MAX);

/** The bounds of the presence choice of a change point. */
const PRESENCE = new IntegerBounds(0n, 1n);

/** How a Scheduler chooses the ready task to release. */
export interface Strategy {
  /** The depth of PCT, and 0 for the uniform strategy. */
  readonly depth: number;
}

/** A ready task as PCT ranks it. */
export interface Ranked {
  /** 0 until a change point lowers the task, and below every earlier level after each lowering. */
  readonly level: number;
  /** The task's priority. */
  readonly priority: bigint;
}

/**
 * Returns the strategy that chooses each release among the ready tasks, in
 * the order that they became ready, uniformly, with target 0 and edge 0. A
 * release with one ready task records a choice that consumes nothing. A
 * shrunk schedule releases the tasks in the order that they became ready,
 * wherever the failure allows.
 *
 * @returns The strategy.
 */
export function uniform(): Strategy {
  return { depth: 0 };
}

/**
 * Returns the strategy of probabilistic concurrency testing of depth. Each
 * task receives a priority when it is spawned, a choice over [0, 2^64 − 1]
 * with target 0, and keeps it when it yields, waits or sleeps. The ready
 * task with the highest priority runs, the earliest ready among equals, and
 * a release makes no choice. Each run and each advance of the scheduler
 * starts with depth − 1 change points, each a presence choice with edge 1
 * and then a count of releases. The task released at that count falls below
 * every other task, and a later change point puts its task lower still.
 *
 * @param depth - The depth, 1 or more.
 * @returns The strategy.
 * @throws RangeError for a depth that is no integer of 1 or more.
 */
export function pct(depth: number): Strategy {
  if (!Number.isSafeInteger(depth) || depth < 1) {
    throw new RangeError(`stateful: pct(${depth}) is no integer of 1 or more`);
  }
  return { depth };
}

/**
 * Returns the priority of a task that a scheduler spawns: a choice of the
 * case under PCT, and 0 under the uniform strategy, which makes no choice.
 *
 * @param c - The case.
 * @param strategy - The strategy.
 * @returns The priority.
 */
export function priorityOf(c: Case, strategy: Strategy): bigint {
  return strategy.depth > 0 ? onEngine(c, (e) => e.integer(UNSIGNED)) : 0n;
}

/**
 * Returns the counts of the change points of one run or one advance: up to
 * depth − 1 under PCT, each a presence choice and a count, and none under
 * the uniform strategy.
 *
 * @param c - The case.
 * @param strategy - The strategy.
 * @returns The counts, in the order of their choices.
 */
export function changePoints(c: Case, strategy: Strategy): bigint[] {
  return onEngine(c, (e) => {
    const points: bigint[] = [];
    for (let i = 1; i < strategy.depth; i += 1) {
      if (e.integer(PRESENCE, 1n) === 1n) {
        points.push(e.integer(UNSIGNED));
      }
    }
    return points;
  });
}

/**
 * Returns the index of the ready task to release: under PCT the task of the
 * highest level and then the highest priority, the earliest ready among
 * equals, and under the uniform strategy the case's choice of an index, with
 * target 0.
 *
 * @param c - The case.
 * @param strategy - The strategy.
 * @param ready - The ready tasks, in the order that they became ready.
 * @returns The index.
 */
export function pick(c: Case, strategy: Strategy, ready: readonly Ranked[]): number {
  if (strategy.depth === 0) {
    const count = BigInt(ready.length);
    const bounds = new IntegerBounds(0n, count - 1n);
    return Number(
      onEngine(c, (e) =>
        e.choose({ bounds, draw: (source) => source.below(count), edge: 0n }),
      ),
    );
  }
  let best = 0;
  ready.forEach((task, i) => {
    const top = ready[best] as Ranked;
    if (
      task.level > top.level ||
      (task.level === top.level && task.priority > top.priority)
    ) {
      best = i;
    }
  });
  return best;
}
