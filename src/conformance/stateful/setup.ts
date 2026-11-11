// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The setup of a machine subject: the options of its steps and of its
 * concurrent section, the options of its scheduler, and the actions that
 * every case keeps.
 */

import type { Case } from "../../prop/case.js";
import type { Action } from "../../stateful/machine.js";
import type { Option } from "../../stateful/option.js";
import { maxReleases, Scheduler } from "../../stateful/scheduler.js";
import type { Strategy } from "../../stateful/strategy.js";

/** The options of a subject's steps, those of a concurrent section, the options of a subject's scheduler, and the actions that every case keeps. */
export interface Setup {
  /** The options that every subject takes: mean, max and swarm. */
  readonly steps: readonly Option[];
  /** The options of a concurrent section: clients, concurrent and concurrentMean. */
  readonly section: readonly Option[];
  /** The strategy of the scheduler that a subject with a concurrent section or with tasks of its own makes in each case. */
  readonly strategy: Strategy;
  /** The most tasks that one run or one advance of that scheduler releases. */
  readonly maxReleases: number;
  /** The names of the actions of the subject that every case keeps. */
  readonly keep: readonly string[];
}

/**
 * Returns a scheduler of c with the strategy and the most releases of
 * setup.
 *
 * @param c - The case whose choices decide the releases.
 * @param setup - The setup of the subject.
 * @returns The scheduler.
 */
export function schedulerOf(c: Case, setup: Setup): Scheduler {
  return new Scheduler(c, setup.strategy, maxReleases(setup.maxReleases));
}

/**
 * Returns actions with keep set on each action that setup names, in the
 * same order.
 *
 * @param setup - The setup of the subject.
 * @param actions - The actions of the subject's machine.
 * @returns The actions.
 */
export function marked<S>(setup: Setup, actions: readonly Action<S>[]): Action<S>[] {
  return actions.map((action) =>
    setup.keep.includes(action.name) ? { ...action, keep: true } : action,
  );
}
