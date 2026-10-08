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
 * no two of them equal. Two configurations are the same when their sets are
 * equal and their states are the same states in any order. The search stops
 * as undecided before a step that would take it past its budget, before it
 * stores a configuration that would take the memo past its limit, which
 * counts one bit per call of the partition for each configuration, and once
 * its time has passed.
 *
 * The frontier of a search is its first configuration, in search order,
 * with the most linearized calls. The search states the frontier's order,
 * its states and the candidates that the spec rejected there.
 */

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

/** How a check or the search of a partition ended. */
export type Verdict = "passed" | "violated" | "undecided";

/** The limit that stopped an undecided search. */
export type Limit = "steps" | "memo" | "time";

/** The number of steps between two readings of the clock. */
const CLOCK_STEPS = 1024;

/** How the search of one partition ended, and its frontier. */
export interface Ending<S> {
  /** The partition's verdict. */
  readonly outcome: Verdict;
  /** The steps that the search spent. */
  readonly steps: number;
  /** The positions of the frontier's calls, in order, for a search that did not pass. */
  readonly linearized: readonly number[];
  /** The frontier's states, or for a search that passed the states after the order it found. */
  readonly states: readonly S[];
  /** The positions of the calls that the spec rejected at the frontier. */
  readonly candidates: readonly number[];
  /** The limit that stopped an undecided search. */
  readonly limit: Limit | undefined;
}

/** A function of a spec that threw during a search, with the call that the search stepped. */
export class SpecError extends Error {
  /** The function: initial, next, equal or key. */
  readonly fn: string;
  /** The call that the search stepped, or undefined before the first step. */
  readonly call: number | undefined;
  /** The operation of that call, or undefined before the first step. */
  readonly operation: string | undefined;

  /**
   * Returns the error of a function of a spec that threw.
   *
   * @param fn - The function.
   * @param stepped - The call that the search stepped, as the record states it, or undefined.
   * @param cause - What the function threw.
   */
  constructor(
    fn: string,
    stepped: { readonly call: number; readonly operation: Operation } | undefined,
    cause: unknown,
  ) {
    const on =
      stepped === undefined ? "" : ` on ${JSON.stringify(stepped.operation.name)}`;
    super(`the spec's ${fn} throws${on}`, { cause });
    this.name = "SpecError";
    this.fn = fn;
    this.call = stepped?.call;
    this.operation = stepped?.operation.name;
  }
}

/** A limit that stopped the search. */
class Stopped {
  readonly limit: Limit;

  constructor(limit: Limit) {
    this.limit = limit;
  }
}

/** The search of one partition. */
export class Search<S> {
  readonly #calls: readonly Checked[];
  readonly #spec: Spec<S>;
  readonly #equal: (a: S, b: S) => boolean;
  readonly #key: (state: S) => string;
  readonly #cost: (state: S) => number;
  readonly #budget: number;
  readonly #memoLimit: number;
  /** When the check's time passes, on the platform clock, and Infinity for no limit. */
  readonly #deadline: number;
  /** The steps at which the search reads the clock next. */
  #clockAt = 0;
  /** The next and the previous entry of each entry, with the head and the tail after the entries. */
  readonly #next: number[];
  readonly #prev: number[];
  readonly #head: number;
  /** The position of the call of each entry, and whether the entry is an invocation. */
  readonly #position: number[];
  readonly #invokes: boolean[];
  /** The entry of each call's invocation, and of a known call's completion. */
  readonly #invocation: number[];
  readonly #completion: (number | undefined)[];
  /** The number of known calls that are not linearized. */
  #open: number;
  #steps = 0;
  /** The set of linearized calls, a bit per position. */
  #done = 0n;
  #states: S[] = [];
  readonly #stack: [position: number, states: S[]][] = [];
  readonly #memo = new Map<string, S[][]>();
  #configurations = 0;
  #linearized: number[] = [];
  #frontier: S[] = [];
  #candidates: number[] = [];
  #atFrontier = true;
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
    this.#calls = calls;
    this.#spec = spec;
    this.#equal =
      spec.equal === undefined ? sameState : (a, b) => spec.equal?.(a, b) === true;
    this.#key =
      spec.key === undefined ? stateKey : (state) => String(spec.key?.(state));
    this.#cost = (spec as Partial<Costed<S>>)[COST] ?? (() => 1);
    this.#budget = config.budget;
    this.#memoLimit = config.memoLimit;
    this.#deadline = deadline;
    const entries: [event: number, position: number, invokes: boolean][] = [];
    calls.forEach(({ span }, position) => {
      entries.push([span.call, position, true]);
      if (span.operation.known)
        entries.push([span.completion as number, position, false]);
    });
    entries.sort(([a], [b]) => a - b);
    const n = entries.length;
    this.#head = n;
    const chain = [n, ...entries.keys(), n + 1];
    this.#next = new Array<number>(n + 2).fill(0);
    this.#prev = new Array<number>(n + 2).fill(0);
    for (let i = 0; i + 1 < chain.length; i += 1) {
      this.#next[chain[i] as number] = chain[i + 1] as number;
      this.#prev[chain[i + 1] as number] = chain[i] as number;
    }
    this.#position = entries.map(([, position]) => position);
    this.#invokes = entries.map(([, , invokes]) => invokes);
    this.#invocation = new Array<number>(calls.length).fill(0);
    this.#completion = new Array<number | undefined>(calls.length).fill(undefined);
    entries.forEach(([, position, invokes], entry) => {
      if (invokes) this.#invocation[position] = entry;
      else this.#completion[position] = entry;
    });
    this.#open = calls.filter(({ span }) => span.operation.known).length;
  }

  /**
   * Searches the partition, and returns how the search ended.
   *
   * @returns The ending.
   * @throws SpecError when a function of the spec throws.
   */
  run(): Ending<S> {
    try {
      this.#states = [this.#spec.initial()];
      this.#frontier = this.#states;
      if (this.#search()) {
        return { ...this.#ending("passed", undefined), states: this.#states };
      }
      return this.#ending("violated", undefined);
    } catch (err) {
      if (err instanceof Stopped) return this.#ending("undecided", err.limit);
      const stepped =
        this.#stepped === undefined ? undefined : this.#calls[this.#stepped]?.span;
      throw new SpecError(this.#calling, stepped, err);
    }
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
    let entry = this.#next[this.#head] as number;
    while (this.#open > 0) {
      if (!this.#invokes[entry]) {
        if (this.#stack.length === 0) return false;
        entry = this.#backtrack();
      } else if (this.#linearize(this.#position[entry] as number)) {
        entry = this.#next[this.#head] as number;
      } else {
        entry = this.#next[entry] as number;
      }
    }
    return true;
  }

  /** Linearizes a candidate when the spec accepts it in a new configuration, and reports whether it did. */
  #linearize(position: number): boolean {
    this.#stepped = position;
    const following = this.#step((this.#calls[position] as Checked).span.operation);
    if (following.length === 0) {
      if (this.#atFrontier) this.#candidates.push(position);
      return false;
    }
    const done = this.#done | (1n << BigInt(position));
    if (!this.#remember(done, following)) return false;
    this.#stack.push([position, this.#states]);
    this.#done = done;
    this.#states = following;
    this.#lift(position);
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
      const cost = this.#cost(state);
      if (this.#steps + cost > this.#budget) throw new Stopped("steps");
      if (this.#steps >= this.#clockAt) {
        if (performance.now() >= this.#deadline) throw new Stopped("time");
        this.#clockAt = this.#steps + CLOCK_STEPS;
      }
      this.#steps += cost;
      for (const after of this.#spec.next(state, op)) {
        this.#calling = "equal";
        if (!following.some((kept) => this.#equal(after, kept))) following.push(after);
        this.#calling = "next";
      }
    }
    return following;
  }

  /** Stores a configuration, and reports whether the memo lacked it. */
  #remember(done: bigint, states: S[]): boolean {
    this.#calling = "key";
    const keys = [...new Set(states.map(this.#key))].sort();
    const name = `${done.toString(16)}|${JSON.stringify(keys)}`;
    const bucket = this.#memo.get(name) ?? [];
    this.#calling = "equal";
    for (const seen of bucket) {
      if (
        seen.length === states.length &&
        states.every((state) => seen.some((other) => this.#equal(state, other)))
      ) {
        return false;
      }
    }
    if ((this.#configurations + 1) * this.#calls.length > this.#memoLimit) {
      throw new Stopped("memo");
    }
    bucket.push(states);
    this.#memo.set(name, bucket);
    this.#configurations += 1;
    return true;
  }

  /** Undoes the last linearized call, and returns the entry after its invocation. */
  #backtrack(): number {
    const [position, states] = this.#stack.pop() as [number, S[]];
    this.#states = states;
    this.#done &= ~(1n << BigInt(position));
    this.#unlift(position);
    this.#atFrontier = false;
    return this.#next[this.#invocation[position] as number] as number;
  }

  /** Takes a call's entries out of the scan. */
  #lift(position: number): void {
    this.#unlink(this.#invocation[position] as number);
    const completion = this.#completion[position];
    if (completion !== undefined) {
      this.#unlink(completion);
      this.#open -= 1;
    }
  }

  /** Puts a call's entries back, in the reverse order of lift. */
  #unlift(position: number): void {
    const completion = this.#completion[position];
    if (completion !== undefined) {
      this.#relink(completion);
      this.#open += 1;
    }
    this.#relink(this.#invocation[position] as number);
  }

  /** Takes one entry out of the list. */
  #unlink(entry: number): void {
    const before = this.#prev[entry] as number;
    const after = this.#next[entry] as number;
    this.#next[before] = after;
    this.#prev[after] = before;
  }

  /** Puts back an entry that unlink took out, between its old neighbours. */
  #relink(entry: number): void {
    this.#next[this.#prev[entry] as number] = entry;
    this.#prev[this.#next[entry] as number] = entry;
  }
}
