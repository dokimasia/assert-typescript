// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The phases of a run after its known cases: the simplest case, the random
 * cases with their prefix cases and the edge cases, and the coverage phase,
 * which runs further random cases to each check of the requirements.
 */

import { Generating, type Provider, Replaying } from "./case/providers.js";
import * as coverage from "./coverage.js";
import { BOUNDARIES, Edge } from "./edge.js";
import {
  type Body,
  type Execution,
  execute,
  type Observer,
  type Phase,
} from "./execution.js";
import type { Resolved } from "./settings.js";
import { caseSource } from "./source.js";
import { type Outcome, shortfallOf, type Tally } from "./tally.js";
import { Tree } from "./tree.js";
import type { Work } from "./work.js";

/** A phase generates at most this many times as many random cases as the valid cases that it aims for. */
const GENERATION_FACTOR = 10;

/** A run tries prefix cases while at most cases / PREFIX_DIVISOR of its cases are valid, and never past MAX_PREFIX_CASES. */
const PREFIX_DIVISOR = 10;
const MAX_PREFIX_CASES = 50;

/** A random case has a prefix case only when it made at least this many choices. */
const MIN_PREFIXED_CHOICES = 2;

/** Returns the most valid cases that a run may have and still try a prefix case. */
function prefixCases(cases: number): number {
  return Math.min(Math.floor(cases / PREFIX_DIVISOR), MAX_PREFIX_CASES);
}

/**
 * The cases of a run after its stored cases, in the order that one worker
 * runs them. The simplest case comes first. Each random case is followed by
 * its prefix case and the next edge case, and the edge cases left when the
 * random cases stop run then. phase is the phase of the random cases:
 * random up to the first check, and coverage after it.
 */
export class Phases {
  readonly #body: Body;
  readonly settings: Resolved;
  readonly tally: Tally;
  readonly #observer: Observer;
  readonly tree = new Tree();
  readonly #edges = BOUNDARIES.map((boundary) => new Edge(boundary));
  #index = 0;
  phase: Phase = "random";

  /**
   * Returns the phases of a run of body.
   *
   * @param body - The body.
   * @param settings - The settings of the run.
   * @param tally - The counts of the run so far.
   * @param observer - What sees every call of the body with its phase.
   */
  constructor(body: Body, settings: Resolved, tally: Tally, observer: Observer) {
    this.#body = body;
    this.settings = settings;
    this.tally = tally;
    this.#observer = observer;
  }

  /** Runs one case of phase into the tree, and shows it to the observer. */
  *call(provider: Provider, phase: Phase): Work<Execution> {
    const execution = yield* execute(
      this.#body,
      provider,
      this.settings.maxChoices,
      this.tree,
    );
    this.#observer(phase, execution);
    return execution;
  }

  /** Runs one case of phase, counts it, and returns the outcome that it ends the run with. */
  *attempt(provider: Provider, phase: Phase): Work<Outcome | undefined> {
    return this.tally.take(yield* this.call(provider, phase));
  }

  /** Runs the next random case, then its prefix case and the next edge case. */
  *#random(): Work<Outcome | undefined> {
    const source = caseSource(this.settings.seed, BigInt(this.#index));
    this.#index += 1;
    const execution = yield* this.call(new Generating(source), this.phase);
    const outcome = this.tally.take(execution);
    if (outcome !== undefined) {
      return outcome;
    }
    const { choices } = execution.case;
    const prefixed =
      this.tally.valid <= prefixCases(this.settings.cases) &&
      choices.length >= MIN_PREFIXED_CHOICES &&
      !this.tree.exhausted;
    if (prefixed) {
      const cut = 1 + Number(source.below(BigInt(choices.length - 1)));
      const prefix = yield* this.attempt(
        new Replaying(choices.slice(0, cut)),
        "prefix",
      );
      if (prefix !== undefined) {
        return prefix;
      }
    }
    return yield* this.#nextEdge();
  }

  /** Runs the next edge case, unless none is left or the domain is exhausted. */
  *#nextEdge(): Work<Outcome | undefined> {
    const [edge] = this.#edges;
    if (edge === undefined || this.tree.exhausted) {
      return undefined;
    }
    this.#edges.shift();
    return yield* this.attempt(edge, "edge");
  }

  /**
   * Runs random cases until target cases are valid, then the edge cases
   * left. The random cases also stop when the domain is exhausted, and after
   * ten times target random cases, repeats included.
   */
  *runTo(target: number): Work<Outcome | undefined> {
    while (
      this.tally.valid < target &&
      !this.tree.exhausted &&
      this.#index < GENERATION_FACTOR * target
    ) {
      const outcome = yield* this.#random();
      if (outcome !== undefined) {
        return outcome;
      }
    }
    while (this.#edges.length > 0 && !this.tree.exhausted) {
      const outcome = yield* this.#nextEdge();
      if (outcome !== undefined) {
        return outcome;
      }
    }
    return undefined;
  }
}

/**
 * Runs the random phase to each check, and returns the outcome that ends
 * the run, or undefined when the run passes. The random cases after the
 * first check are the coverage phase's. A run without requirements meets
 * them all at the first check, and the last check decides every
 * requirement, so the checks end with a pass or an outcome.
 */
export function* checks(phases: Phases): Work<Outcome | undefined> {
  const { settings, tally } = phases;
  const multiples =
    settings.requirements.length > 0 ? coverage.CHECKS : coverage.CHECKS.slice(0, 1);
  for (const [position, multiple] of multiples.entries()) {
    phases.phase = position === 0 ? "random" : "coverage";
    const outcome =
      (yield* phases.runTo(multiple * settings.cases)) ??
      tally.failureWithoutCounterexample();
    if (outcome !== undefined) {
      return outcome;
    }
    const last = position === multiples.length - 1;
    const [shortfall, met] = shortfallOf(
      tally,
      settings.requirements,
      last,
      phases.tree.exhausted,
    );
    if (shortfall !== undefined) {
      return tally.outcome("coverage-unmet", { shortfall });
    }
    if (met) {
      break;
    }
  }
  return undefined;
}
