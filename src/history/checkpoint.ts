// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The searches that a check of linearizability keeps for the next check of
 * its history.
 *
 * A check with a checkpoint reads the events that the history recorded since
 * the check before it. A completion of a call that the kept check read as
 * pending makes the partition of the call search again from its first call,
 * and a call that fails leaves its partition. Each new call joins the
 * partitions of its keys, and a call without keys joins every partition. A
 * call that joins two or more partitions joins them into one, which searches
 * again from its first call. Each other partition grows its kept search by
 * its new calls, when the search fits the limits of the check.
 */

import type { Completion } from "./event.js";
import { type History, recorded } from "./history.js";
import type { Config } from "./option.js";
import { type Checked, callsFrom, type Partition, partitionsOf } from "./partition.js";
import { Search } from "./search.js";
import { CallOperation, type Spec } from "./spec.js";

/** A partition of a checkpoint, and the kept search of its first calls. */
interface Part {
  /** The keys of the calls in the order of their first use, and none for a partition of every key. */
  keys: unknown[];
  /** The calls of the partition, in event order. */
  readonly calls: Checked[];
  /** The search of the first calls of the partition, and undefined for a partition that searches from its first call. */
  search: Search<unknown> | undefined;
}

/** Returns a partition without calls. */
function emptyPart(): Part {
  return { keys: [], calls: [], search: undefined };
}

/** The kept searches of a checkpoint, and the partitions of their history. */
class State {
  /** The history of the kept searches, and undefined for a checkpoint that keeps no search. */
  readonly history: History | undefined;
  /** True when the kept check searched every call as one partition. */
  readonly whole: boolean;
  /** The number of events that the kept check read. */
  events = 0;
  /** The partitions. */
  parts: Part[] = [];
  /**
   * The partition that every new call joins, or undefined. It is the one
   * partition of a check of whole, and of a history with a call without keys.
   */
  every: Part | undefined;
  /** The partition of the identity of each key. */
  readonly #keyOf = new Map<string, Part>();
  /** The partition of each call that the kept check read as pending, by the index of its invocation. */
  readonly #pending = new Map<number, Part>();

  /**
   * Returns the state of a check of history, which has no partition yet.
   *
   * @param history - The history, or undefined for a checkpoint that keeps no search.
   * @param whole - True for a check of every call as one partition.
   */
  constructor(history: History | undefined, whole: boolean) {
    this.history = history;
    this.whole = whole;
    if (whole) {
      this.every = emptyPart();
      this.parts = [this.every];
    }
  }

  /**
   * Records the completion of a call that the kept check read as pending.
   * The partition of the call searches again from its first call. A call that
   * failed leaves its partition, and the other calls of the partition then
   * form the partitions of a check of every call.
   */
  complete(completion: Completion): void {
    const part = this.#pending.get(completion.call) as Part;
    this.#pending.delete(completion.call);
    part.search = undefined;
    const at = part.calls.findIndex(({ span }) => span.call === completion.call);
    const call = part.calls[at] as Checked;
    if (completion.kind !== "fail") {
      const known = completion.kind === "ok";
      const op = call.span.operation;
      const output = known ? completion.output : undefined;
      part.calls[at] = {
        span: {
          ...call.span,
          completion: completion.index,
          operation: new CallOperation(op.name, op.args, known, output),
        },
        keys: call.keys,
        ids: call.ids,
      };
      return;
    }
    part.calls.splice(at, 1);
    if (this.whole) {
      return;
    }
    for (const id of call.ids) {
      this.#keyOf.delete(id);
    }
    this.#replace([part]);
  }

  /**
   * Adds a new call to the partitions that it joins. A call joins the
   * partition of every key when there is one, every partition when it has no
   * key, and the partitions of its keys otherwise.
   */
  join(call: Checked): void {
    if (this.every !== undefined) {
      this.#extend(this.every, call);
    } else if (call.ids.length > 0) {
      this.#joinKeys(call);
    } else if (this.parts.length === 1) {
      this.#extend(this.parts[0] as Part, call);
    } else {
      this.#replace([...this.parts], call);
    }
  }

  /**
   * Adds a new call with keys to the partition of its keys. A call whose keys
   * belong to no partition starts one, and a call whose keys belong to two or
   * more partitions joins them into one.
   */
  #joinKeys(call: Checked): void {
    const joined = [...new Set(call.ids.map((id) => this.#keyOf.get(id)))].filter(
      (part) => part !== undefined,
    );
    if (joined.length > 1) {
      this.#replace(joined, call);
      return;
    }
    let [found] = joined;
    if (found === undefined) {
      found = emptyPart();
      this.parts.push(found);
    }
    this.#extend(found, call);
  }

  /** Adds a new call to part, and maps its keys and a pending call to part. */
  #extend(part: Part, call: Checked): void {
    part.calls.push(call);
    if (call.span.completion === undefined) {
      this.#pending.set(call.span.call, part);
    }
    if (this.whole) {
      return;
    }
    if (call.ids.length === 0) {
      part.keys = [];
      this.every = part;
    }
    call.ids.forEach((id, i) => {
      if (this.#keyOf.get(id) === part) {
        return;
      }
      this.#keyOf.set(id, part);
      if (part !== this.every) {
        part.keys.push(call.keys[i]);
      }
    });
  }

  /**
   * Replaces the partitions old with the partitions of their calls and of
   * more. more are new calls, which follow every call of old. Each new
   * partition searches from its first call.
   */
  #replace(old: readonly Part[], ...more: Checked[]): void {
    const calls = old
      .flatMap((part) => part.calls)
      .sort((a, b) => a.span.call - b.span.call);
    this.every = undefined;
    this.parts = this.parts.filter((part) => !old.includes(part));
    for (const partition of partitionsOf([...calls, ...more])) {
      const part: Part = {
        keys: [...partition.keys],
        calls: [...partition.calls],
        search: undefined,
      };
      this.parts.push(part);
      if (part.keys.length === 0) {
        this.every = part;
      }
      for (const c of part.calls) {
        for (const id of c.ids) {
          this.#keyOf.set(id, part);
        }
        if (c.span.completion === undefined) {
          this.#pending.set(c.span.call, part);
        }
      }
    }
  }
}

/** The kept searches of each checkpoint. */
const STATES = new WeakMap<Checkpoint<unknown>, State>();

/**
 * The searches of the last check of a history that passed with it.
 *
 * resume passes a checkpoint to a check of linearizability. The check
 * continues the search of each partition that the checkpoint keeps over the
 * calls that the history recorded since, and keeps its own searches in the
 * checkpoint when it passes. A check that does not pass leaves the checkpoint
 * without a search. A continued search takes the steps that a search of
 * every call takes after the order that the kept search found, so the check
 * reports what a check of every call reports.
 *
 * Every check that passes one checkpoint passes the same spec, because the
 * kept searches contain the states of that spec.
 *
 * ```ts
 * const h = new history.History();
 * const checkpoint = new history.Checkpoint<number>();
 * for (let value = 0; value < 100; value += 1) {
 *   h.invoke(0, "write", [value], "x").ok(null);
 *   history.isLinearizable(seat, h, register, "the register is linearizable",
 *     history.resume(checkpoint));
 * }
 * ```
 */
// biome-ignore lint/correctness/noUnusedVariables: S is the type of the states of the kept searches, which the signature of the definition states and no member reads.
export class Checkpoint<S> {
  /** Returns a checkpoint that keeps no search. */
  constructor() {
    STATES.set(this, new State(undefined, false));
  }
}

/**
 * Returns the partitions of a check of history with checkpoint, and their
 * searches, in the order of their first invocation. A check of whole has one
 * partition of every call. The search of a partition is its kept search
 * grown by its new calls when the kept search fits the limits of config, and
 * a new search otherwise. The searches step through spec and read deadline.
 *
 * @param checkpoint - The checkpoint of the check.
 * @param history - The history of the check.
 * @param spec - The spec of the check.
 * @param config - The limits of the check.
 * @param deadline - When the time of the check passes, and Infinity for no limit.
 * @param whole - True for a check of every call as one partition.
 * @returns The partitions and their searches.
 */
export function resumed<S>(
  checkpoint: Checkpoint<S>,
  history: History,
  spec: Spec<S>,
  config: Config,
  deadline: number,
  whole: boolean,
): [Partition, Search<S>][] {
  let state = STATES.get(checkpoint) as State;
  if (state.history !== history || state.whole !== whole) {
    state = new State(history, whole);
    STATES.set(checkpoint, state);
  }
  const { events, ids } = recorded(history, state.events);
  const { calls, earlier } = callsFrom(events, ids, state.events);
  state.events += events.length;
  for (const completion of earlier) {
    state.complete(completion);
  }
  for (const call of calls) {
    state.join(call);
  }
  if (!whole) {
    const first = (part: Part) => (part.calls[0] as Checked).span.call;
    state.parts.sort((a, b) => first(a) - first(b));
  }
  return state.parts.map((part) => {
    let search = part.search as Search<S> | undefined;
    if (search === undefined || !search.fits(part.calls.length, config)) {
      search = new Search(part.calls, spec, config, deadline);
    } else {
      search.grow(part.calls.slice(search.calls.length), spec, deadline);
    }
    part.search = search as Search<unknown>;
    return [{ keys: [...part.keys], calls: [...part.calls] }, search];
  });
}

/**
 * Leaves checkpoint without a search, after a check that did not pass.
 *
 * @param checkpoint - The checkpoint.
 */
export function forget(checkpoint: Checkpoint<unknown>): void {
  STATES.set(checkpoint, new State(undefined, false));
}
