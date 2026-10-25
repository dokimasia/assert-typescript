// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Shrinking: the search for the smallest case that fails the same way.
 *
 * A case is smaller than another when its choice sequence is shorter, or
 * equally long and smaller in the first choice where the two differ, as
 * the order module states.
 *
 * The shrinker runs its passes over the best case of one failure, in the
 * order of its list of passes, until a whole round accepts no candidate.
 * delete-and-lower runs only in a round in which no other pass accepted a
 * candidate. A candidate is run only when it is smaller than the best case
 * and no earlier candidate had the same choices. It is accepted when its
 * run fails with the same identity and the run's recorded choices are
 * smaller than the best case's. A run that fails with another identity is
 * kept as a further failure. Every failure is shrunk in turn, the one with
 * the smallest case first, and all of them share one budget of runs.
 */

import { Replaying } from "./case/providers.js";
import type { Span } from "./case/record.js";
import type { Choice } from "./choice.js";
import {
  type Body,
  type Execution,
  execute,
  identityOf,
  type Observer,
  type Phase,
  unobserved,
} from "./execution.js";
import type { Key } from "./float.js";
import { compareSequences } from "./order.js";
import {
  deleteAndLower,
  lowerAndDelete,
  lowerTogether,
  redistribute,
} from "./shrink/combined.js";
import {
  floatSimplify,
  minimizeChoice,
  minimizeDuplicates,
  sequenceLower,
} from "./shrink/lowering.js";
import { keysOf, type Node, nodesOf } from "./shrink/nodes.js";
import {
  deleteSpan,
  deleteSpanChunk,
  deleteSpanRun,
  deleteStructurePair,
  liftDescendant,
  sequenceDelete,
  sortSiblings,
  targetSpan,
} from "./shrink/spans.js";
import { encode } from "./token.js";
import type { Work } from "./work.js";

/** The runs of the body that shrinking every failure of a run may spend. */
export const DEFAULT_BUDGET = 2000;

/** The signal that the shrink budget is spent. */
export class Exhausted extends Error {
  /** Returns the signal. */
  constructor() {
    super("prop: the shrink budget is spent");
    this.name = "Exhausted";
  }
}

/** The smallest case found so far that fails with one identity. */
export interface Failure {
  readonly identity: string;
  readonly execution: Execution;
  readonly nodes: readonly Node[];
  readonly keys: readonly Key[];
}

/** The shrink of every failure of one run, over one budget. */
export class Shrinker {
  readonly #body: Body;
  readonly #maxChoices: number;
  readonly #observer: Observer;
  /** The runs of the body that the shrink may spend. */
  readonly budget: number;
  /** The runs spent. */
  runs = 0;
  /** The smallest case of each identity, in the order the identities were found. */
  readonly failures = new Map<string, Failure>();
  /** The token of every candidate run so far, with the number of choices its run recorded. */
  readonly #sizes = new Map<string, number>();
  /** The reading of the platform clock after which the shrink stops, or infinity for none. */
  readonly #deadline: number;
  #target: string;

  /**
   * Returns the shrinker that starts from the first failing case.
   *
   * @param body - The body.
   * @param first - The first failing execution.
   * @param maxChoices - The most choices of a case.
   * @param budget - The runs that the shrink may spend.
   * @param observer - What sees every run.
   * @param time - The milliseconds that the shrink may take on the platform
   *   clock, and 0 for no limit.
   */
  constructor(
    body: Body,
    first: Execution,
    maxChoices: number,
    budget: number,
    observer: Observer = unobserved,
    time = 0,
  ) {
    this.#body = body;
    this.#maxChoices = maxChoices;
    this.#observer = observer;
    this.#deadline = time > 0 ? performance.now() + time : Number.POSITIVE_INFINITY;
    this.budget = budget;
    this.#sizes.set(encode(first.case.choices), first.case.choices.length);
    this.#target = identityOf(first) as string;
    this.#record(first);
  }

  /** The failure being shrunk. */
  get best(): Failure {
    return this.failures.get(this.#target) as Failure;
  }

  /** The best case's choices. */
  get nodes(): readonly Node[] {
    return this.best.nodes;
  }

  /** The best case's spans. */
  get spans(): readonly Span[] {
    return this.best.execution.case.spans;
  }

  /** Keeps a failing run when it is its identity's first or smallest. */
  #record(execution: Execution): void {
    const identity = identityOf(execution) as string;
    const nodes = nodesOf(execution.case);
    const keys = keysOf(nodes);
    const known = this.failures.get(identity);
    if (known === undefined || compareSequences(keys, known.keys) < 0) {
      this.failures.set(identity, { identity, execution, nodes, keys });
    }
  }

  /**
   * Runs the body on choices in phase, spending one run of the budget.
   *
   * @param choices - The choices.
   * @param phase - The phase of the run.
   * @returns The work, which returns the execution.
   * @throws Exhausted when the budget or the time is spent.
   */
  *run(choices: readonly Choice[], phase: Phase = "shrink"): Work<Execution> {
    if (this.runs >= this.budget || performance.now() > this.#deadline) {
      throw new Exhausted();
    }
    this.runs += 1;
    const execution = yield* execute(
      this.#body,
      new Replaying(choices),
      this.#maxChoices,
    );
    this.#observer(phase, execution);
    return execution;
  }

  /**
   * Returns the number of choices that the run of a candidate recorded, or
   * undefined for choices that no candidate had.
   *
   * @param choices - The choices of the candidate.
   * @returns The number of choices.
   */
  sizeOf(choices: readonly Choice[]): number | undefined {
    return this.#sizes.get(encode(choices));
  }

  /**
   * Runs a candidate that is smaller than the best case and new, and
   * reports whether it became the best case.
   *
   * @param nodes - The candidate's choices with their requests.
   * @returns The work, which returns whether the candidate became the best case.
   * @throws Exhausted when the budget or the time is spent.
   */
  *consider(nodes: readonly Node[]): Work<boolean> {
    if (compareSequences(keysOf(nodes), this.best.keys) >= 0) {
      return false;
    }
    const choices = nodes.map((node) => node.choice);
    const token = encode(choices);
    if (this.#sizes.has(token)) {
      return false;
    }
    const execution = yield* this.run(choices);
    this.#sizes.set(token, execution.case.choices.length);
    if (execution.failure === undefined) {
      return false;
    }
    const before = this.best;
    this.#record(execution);
    return this.best !== before;
  }

  /**
   * Shrinks each failure in turn, the one with the smallest case first.
   * Shrinking stops when every failure is done or the budget is spent. Two
   * failures of a body that is a function of its choices never have cases
   * of equal keys, because equal keys are equal choices.
   *
   * @returns The work.
   */
  *shrinkAll(): Work<void> {
    const done = new Set<string>();
    try {
      for (;;) {
        const pending = [...this.failures.values()].filter(
          (f) => !done.has(f.identity),
        );
        if (pending.length === 0) {
          return;
        }
        const target = pending.reduce((a, b) =>
          compareSequences(a.keys, b.keys) <= 0 ? a : b,
        );
        yield* this.#shrink(target.identity);
        done.add(target.identity);
      }
    } catch (err) {
      if (!(err instanceof Exhausted)) {
        throw err;
      }
    }
  }

  /** Runs rounds of every pass on one failure until a round accepts nothing. */
  *#shrink(identity: string): Work<void> {
    this.#target = identity;
    const passes = [
      deleteSpanChunk,
      deleteSpan,
      liftDescendant,
      deleteSpanRun,
      sequenceDelete,
      deleteStructurePair,
      targetSpan,
      minimizeChoice,
      sequenceLower,
      lowerAndDelete,
      sortSiblings,
      redistribute,
      lowerTogether,
      minimizeDuplicates,
      floatSimplify,
    ];
    for (;;) {
      let improved = false;
      for (const pass of passes) {
        if (yield* pass(this)) {
          improved = true;
        }
      }
      if (!(improved || (yield* deleteAndLower(this)))) {
        return;
      }
    }
  }

  /**
   * Tries candidates in order, and after an acceptance starts over on the
   * new best case.
   *
   * @param candidates - Returns the candidates of the best case.
   * @returns The work, which returns whether any candidate was accepted.
   * @throws Exhausted when the budget or the time is spent.
   */
  *sweep(candidates: () => Iterable<readonly Node[]>): Work<boolean> {
    let improved = false;
    for (;;) {
      let accepted = false;
      for (const candidate of candidates()) {
        if (yield* this.consider(candidate)) {
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        return improved;
      }
      improved = true;
    }
  }
}
