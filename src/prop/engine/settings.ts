// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * What a run is asked to do: its seed, its cases, its limits and the cases
 * that the caller states, with every default filled in, and the cases that
 * a run tries before it generates any.
 */

import { type Provider, Replaying, Valuing } from "./case/providers.js";
import { MAX_CHOICES } from "./case.js";
import type { Choice } from "./choice.js";
import type { Phase } from "./execution.js";
import { DEFAULT_BUDGET } from "./shrink.js";
import type { Requirement } from "./tally.js";
import { type Entry, Tracing } from "./trace.js";

/** Returns the provider of an example: its values, or a replay of its choices. */
function exampleProvider(example: readonly Choice[] | Values): Provider {
  return example instanceof Values
    ? new Valuing(example.values)
    : new Replaying(example);
}

/** The valid cases that a run aims for when the caller states no number. */
export const DEFAULT_CASES = 100;

/** An example of a generator without an inverse: the values of its draws. */
export class Values {
  /** The values of the draws, in order. */
  readonly values: readonly unknown[];

  /**
   * Returns the example of values.
   *
   * @param values - The values of the draws, in order.
   */
  constructor(values: readonly unknown[]) {
    this.values = values;
  }
}

/**
 * What a run is asked to do. traces are the cases whose draws and machine
 * steps the caller states, which run first, and examples the cases whose
 * values the caller states, which run next: each the choice sequence that
 * decodes to its values, or its Values. shrink is the budget of runs that
 * shrinking and explaining every failure may spend, and 0 turns both off.
 * shrinkTime is the milliseconds that they may take on the platform clock,
 * and 0 sets no limit. replay, when set, is the one case that the run
 * tries.
 */
export interface Settings {
  readonly seed: bigint;
  readonly cases?: number;
  readonly maxChoices?: number;
  readonly requirements?: readonly Requirement[];
  readonly traces?: readonly (readonly Entry[])[];
  readonly examples?: readonly (readonly Choice[] | Values)[];
  readonly stored?: readonly (readonly Choice[])[];
  readonly shrink?: number;
  readonly shrinkTime?: number;
  readonly explain?: boolean;
  readonly replay?: readonly Choice[] | undefined;
}

/** The settings with every default filled in. */
export type Resolved = Required<Omit<Settings, "replay">> & Pick<Settings, "replay">;

/**
 * Returns settings with every default filled in: 100 cases, the cap of
 * 8,192 choices, no requirement, trace, example or stored case, a shrink
 * budget of 2,000 runs without a time limit, and an explanation.
 *
 * @param settings - What a run is asked to do.
 * @returns The settings with the defaults.
 * @throws RangeError for a run of fewer than one case.
 */
export function resolve(settings: Settings): Resolved {
  const cases = settings.cases ?? DEFAULT_CASES;
  if (cases < 1) {
    throw new RangeError(`prop: a run of ${cases} cases tests nothing`);
  }
  return {
    seed: settings.seed,
    cases,
    maxChoices: settings.maxChoices ?? MAX_CHOICES,
    requirements: settings.requirements ?? [],
    traces: settings.traces ?? [],
    examples: settings.examples ?? [],
    stored: settings.stored ?? [],
    shrink: settings.shrink ?? DEFAULT_BUDGET,
    shrinkTime: settings.shrinkTime ?? 0,
    explain: settings.explain ?? true,
    replay: settings.replay,
  };
}

/**
 * Returns the cases that a run tries before it generates any, in order,
 * each with its phase and the provider of its values: each trace and each
 * example under example, then each stored case under stored.
 *
 * @param settings - The settings of the run.
 * @returns The phase and the provider of each case.
 */
export function knownCases(settings: Resolved): (readonly [Phase, Provider])[] {
  return [
    ...settings.traces.map((trace) => ["example", new Tracing(trace)] as const),
    ...settings.examples.map(
      (example) => ["example", exampleProvider(example)] as const,
    ),
    ...settings.stored.map((stored) => ["stored", new Replaying(stored)] as const),
  ];
}
