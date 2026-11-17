// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The search of one partition for a linearization, which the definition
 * fixes: Wing and Gong's scan of the calls, with a memo of the
 * configurations that it visited.
 *
 * The entries are the invocations of the partition's calls and the
 * completions of its known calls, in event order. A call that is not known
 * has no completion entry: it takes effect at some point after its
 * invocation, or never. The candidates at each point are the calls whose
 * invocations come before the first completion of a call not yet
 * linearized, and an accepted call restarts the scan from the first entry.
 * The search passes when every known call is linearized.
 *
 * A configuration is a set of linearized calls and the states they leave,
 * no two of them equal. The search skips each configuration that its memo
 * covers. The search stops as undecided before a step that would take it
 * past its budget, before it stores a configuration that would take the
 * memo past its limit, which counts one bit per call of the partition for
 * each configuration, and once its time has passed.
 *
 * The frontier of a search is its first configuration, in search order,
 * with the most linearized calls. The search states the frontier's order,
 * its states and the candidates that the spec rejected there.
 *
 * A search that passed grows by the calls that follow every event that it
 * read, and continues from the order that it found. It takes the steps that
 * a search of every call takes after that order.
 */

import { compareText } from "../order.js";
import { type Ending, type Limit, SpecError, type Verdict } from "./ending.js";
import { Entries } from "./entries.js";
import { Memo } from "./memo.js";
import type { Config } from "./option.js";
import type { Checked } from "./partition.js";
import {
  COST,
  type Costed,
  type Operation,
  type Spec,
  sameState,
  stateKey,
} from "./spec.js";

/** The number of steps between two readings of the clock. */
const CLOCK_STEPS = 1024;

/** A limit that stopped the search. */
class Stopped {
  readonly limit: Limit;

  constructor(limit: Limit) {
    this.limit = limit;
  }
}

/** The spec of a search, with the functions that the search calls. */
interface Functions<S> {
  /** The spec. */
  readonly spec: Spec<S>;
  /** The equal of the spec, or the equality of states without one. */
  readonly equal: (a: S, b: S) => boolean;
  /** The key of the spec, or the key of a state without one. */
  readonly key: (state: S) => string;
  /** The steps of a call of next in a state. */
  readonly cost: (state: S) => number;
}

/** Returns the spec with the functions that a search calls. */
function functionsOf<S>(spec: Spec<S>): Functions<S> {
  return {
    spec,
    equal: spec.equal === undefined ? sameState : (a, b) => spec.equal?.(a, b) === true,
    key: spec.key === undefined ? stateKey : (state) => String(spec.key?.(state)),
    cost: (spec as Partial<Costed<S>>)[COST] ?? (() => 1),
  };
}

/** The search of one partition. */
export class Search<S> {
  readonly #calls: Checked[] = [];
  #functions: Functions<S>;
  readonly #budget: number;
  readonly #memoLimit: number;
  /** When the check's time passes, on the platform clock, and Infinity for no limit. */
  #deadline: number;
  /** The steps at which the search reads the clock next. */
  #clockAt = 0;
  readonly #entries = new Entries();
  #steps = 0;
  /** Whether the search has taken the initial state of its spec. */
  #started: boolean;
  /** The set of linearized calls, a bit per position. */
  #done = 0n;
  #states: S[] = [];
  readonly #stack: [position: number, states: S[]][] = [];
  readonly #memo: Memo<S>;
  #linearized: number[] = [];
  #frontier: S[] = [];
  #candidates: number[] = [];
  #atFrontier: boolean;
  /** The spec's function that the search calls, and the position of the call that it steps. */
  #calling = "initial";
  #stepped: number | undefined;

  /**
   * Lays out the entries of a partition's calls in event order, before the
   * first step.
   *
   * @param calls - The partition's calls, in event order.
   * @param spec - The spec.
   * @param config - The limits of the check.
   * @param deadline - When the check's time passes, and Infinity for no limit.
   */
  constructor(
    calls: readonly Checked[],
    spec: Spec<S>,
    config: Config,
    deadline: number,
  ) {
    this.#functions = functionsOf(spec);
    this.#deadline = deadline;
    this.#budget = config.budget;
    this.#memoLimit = config.memoLimit;
    this.#memo = new Memo(0n, 0, config.memoLimit);
    this.#started = false;
    this.#atFrontier = true;
    this.#add(calls);
  }

  /** The calls of the search, in event order. */
  get calls(): readonly Checked[] {
    return this.#calls;
  }

  /**
   * Reports whether the search continues as a new search when it grows to
   * calls. A new search of the calls takes the steps of this search up to
   * the order that it found when config states the budget and the memo limit
   * of this search, and when the memo stores no more configurations than the
   * memo limit lets a search of the calls store.
   *
   * @param calls - The number of calls of the grown search.
   * @param config - The limits of the check.
   * @returns True when the grown search continues as a new search of its calls.
   */
  fits(calls: number, config: Config): boolean {
    return (
      config.budget === this.#budget &&
      config.memoLimit === this.#memoLimit &&
      this.#memo.stored * calls <= config.memoLimit
    );
  }

  /**
   * Adds calls that follow every event that a search that passed read. The
   * entries of the calls join the scan before the tail, in event order. The
   * search then steps through spec, and reads deadline before its next step.
   * A search of every call takes the same steps from the order that this
   * search found.
   *
   * @param calls - The new calls of the partition, in event order.
   * @param spec - The spec of the check that grows the search.
   * @param deadline - When the time of the check that grows the search
   *   passes, and Infinity for no limit.
   */
  grow(calls: readonly Checked[], spec: Spec<S>, deadline: number): void {
    this.#functions = functionsOf(spec);
    this.#deadline = deadline;
    this.#clockAt = this.#steps;
    this.#add(calls);
  }

  /**
   * Searches the partition, and returns how the search ended. A search that
   * grew continues from the order that it found.
   *
   * @returns The ending.
   * @throws SpecError when a function of the spec throws.
   */
  run(): Ending<S> {
    try {
      if (!this.#started) {
        this.#states = [this.#functions.spec.initial()];
        this.#frontier = this.#states;
        this.#started = true;
      }
      if (this.#search()) {
        return { ...this.#ending("passed", undefined), states: this.#states };
      }
      return this.#ending("violated", undefined);
    } catch (err) {
      if (err instanceof Stopped) {
        return this.#ending("undecided", err.limit);
      }
      const stepped =
        this.#stepped === undefined ? undefined : this.#calls[this.#stepped]?.span;
      throw new SpecError(this.#calling, stepped, err);
    }
  }

  /** Adds calls after the calls of the search, and grows the memo to them. */
  #add(calls: readonly Checked[]): void {
    this.#entries.add(calls, this.#calls.length);
    for (const call of calls) {
      this.#calls.push(call);
    }
    this.#memo.grow(this.#entries.optional, this.#calls.length);
  }

  /** Returns an ending that states the frontier. */
  #ending(outcome: Verdict, limit: Limit | undefined): Ending<S> {
    return {
      outcome,
      steps: this.#steps,
      linearized: outcome === "passed" ? [] : this.#linearized,
      states: this.#frontier,
      candidates: outcome === "passed" ? [] : this.#candidates,
      limit,
    };
  }

  /** Scans the entries until every known call is linearized, and reports whether one order passes. */
  #search(): boolean {
    const entries = this.#entries;
    let entry = entries.first;
    while (entries.open > 0) {
      if (!entries.invokes(entry)) {
        if (this.#stack.length === 0) {
          return false;
        }
        entry = this.#backtrack();
      } else if (this.#linearize(entries.position(entry))) {
        entry = entries.first;
      } else {
        entry = entries.next(entry);
      }
    }
    return true;
  }

  /** Linearizes a candidate when the spec accepts it in a new configuration, and reports whether it did. */
  #linearize(position: number): boolean {
    this.#stepped = position;
    const following = this.#step((this.#calls[position] as Checked).span.operation);
    if (following.length === 0) {
      if (this.#atFrontier) {
        this.#candidates.push(position);
      }
      return false;
    }
    const done = this.#done | (1n << BigInt(position));
    if (!this.#remember(done, following)) {
      return false;
    }
    this.#stack.push([position, this.#states]);
    this.#done = done;
    this.#states = following;
    this.#entries.lift(position);
    this.#atFrontier = this.#stack.length > this.#linearized.length;
    if (this.#atFrontier) {
      this.#linearized = this.#stack.map(([at]) => at);
      this.#frontier = following;
      this.#candidates = [];
    }
    return true;
  }

  /** Returns the states that op leaves from the current ones, without two equal states. */
  #step(op: Operation): S[] {
    const following: S[] = [];
    for (const state of this.#states) {
      this.#calling = "next";
      const cost = this.#functions.cost(state);
      if (this.#steps + cost > this.#budget) {
        throw new Stopped("steps");
      }
      if (this.#steps >= this.#clockAt) {
        if (performance.now() >= this.#deadline) {
          throw new Stopped("time");
        }
        this.#clockAt = this.#steps + CLOCK_STEPS;
      }
      this.#steps += cost;
      for (const after of this.#functions.spec.next(state, op)) {
        this.#calling = "equal";
        if (!following.some((kept) => this.#functions.equal(after, kept))) {
          following.push(after);
        }
        this.#calling = "next";
      }
    }
    return following;
  }

  /** Stores a configuration in the memo, and reports whether the memo did not cover it. */
  #remember(done: bigint, states: S[]): boolean {
    this.#calling = "key";
    const keys = [...new Set(states.map(this.#functions.key))].sort(compareText);
    this.#calling = "equal";
    const visit = this.#memo.visit(done, keys, states, this.#functions.equal);
    if (visit === "full") {
      throw new Stopped("memo");
    }
    return visit === "stored";
  }

  /** Undoes the last linearized call, and returns the entry after its invocation. */
  #backtrack(): number {
    const [position, states] = this.#stack.pop() as [number, S[]];
    this.#states = states;
    this.#done &= ~(1n << BigInt(position));
    this.#entries.unlift(position);
    this.#atFrontier = false;
    return this.#entries.afterInvocation(position);
  }
}
