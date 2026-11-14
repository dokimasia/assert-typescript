// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Traces: a case stated as the draws that it makes and the machine steps
 * that it takes.
 *
 * A trace lists entries in request order. A draw entry states a label and a
 * value. A step entry names an action, and states its client in a
 * concurrent section and the drain mark in the drain. entries returns the
 * trace of a case, which is how a machine's counterexample lists it.
 *
 * A body runs on a trace through Tracing, a provider whose values come from
 * the entries:
 *
 * - A draw takes the next entry, which must be a draw entry with the draw's
 *   label. Its value runs backwards through the draw's generator, and the
 *   draw decodes the choices that result. A draw past the last entry takes
 *   its targets.
 * - A draw of a composite takes no entry when it starts, and its own draws
 *   take theirs. Once it decodes, it takes the next entry by its label and
 *   does not read the value. A case records a composite after its draws.
 * - A draw through a composite, whose generator has a composite inside a
 *   one-of, an optional, a list, a dict, a filter, a map with an inverse or a
 *   recursive, takes the first draw entry with its label up to the next step
 *   entry. When the value runs backwards through a composite, the draws of
 *   the composite take the entries before it, and the draw takes it once it
 *   decodes.
 * - The choices of a draw serve the requests of its own generator. A draw
 *   inside it serves its own, and the outer requests continue after it.
 * - A machine turns each step entry into the choices of one step, which
 *   Tracing serves as they are requested.
 * - Every other request takes its target.
 *
 * A trace that the body cannot follow throws TraceError, which names the
 * entry. The error is not a failure of the case: it ends the run before any
 * case runs.
 *
 * The counterexample of a stored case is a trace too. Its draw entry has the
 * value UNSTATED where the entry of the store does not record a typed literal
 * of the value. A draw of a generator other than a composite refuses such an
 * entry.
 */

import type { Provider, Request } from "./case/providers.js";
import type { Step } from "./case/record.js";
import type { Case, Decoder } from "./case.js";
import type { Choice, Value } from "./choice.js";
import { Composite, type Generator } from "./generator.js";
import { inverseThrough, throughComposite } from "./inverse.js";

/** A draw in progress: the choices of its requests, and how it ends. */
interface Open {
  /** The choices of the draw that no request has taken. */
  readonly queue: Choice[];
  /**
   * The position of the entry that a draw through a composite takes once it
   * decodes, and undefined for every other draw.
   */
  readonly end?: number;
  /** True for a composite, which takes the next entry by its label alone once it decodes. */
  readonly byLabel?: boolean;
}

/** The value of a draw entry that does not record a value. */
export const UNSTATED: unique symbol = Symbol("UNSTATED");

/** A draw entry: the label of a draw and the value that it decoded. */
export interface Draw {
  readonly label: string;
  readonly value: unknown;
}

/** One entry of a trace: a draw entry, or a step entry. */
export type Entry = Draw | Step;

/** Reports whether an entry is a step entry. */
export function isStep(entry: Entry): entry is Step {
  return "action" in entry;
}

/**
 * An entry that the body cannot follow, named by its position. name is the
 * draw's label for a reason of `label` or `value`, and the step's action for
 * a reason of `step`.
 */
export class TraceError extends Error {
  /** The entry's position. */
  readonly entry: number;
  /** The draw's label or the step's action. */
  readonly what: string;
  /** Why the body cannot follow the entry: `label`, `value` or `step`. */
  readonly reason: string;

  /**
   * Returns the error of an entry.
   *
   * @param entry - The entry's position.
   * @param what - The draw's label or the step's action.
   * @param reason - `label`, `value` or `step`.
   */
  constructor(entry: number, what: string, reason: string) {
    super(`prop: trace entry ${entry} (${what}): ${reason}`);
    this.name = "TraceError";
    this.entry = entry;
    this.what = what;
    this.reason = reason;
  }
}

/**
 * Returns a case's draws and steps as a trace, in request order. A step
 * comes before the draws that the case recorded after it.
 *
 * @param c - The case.
 * @returns The trace.
 */
export function entries(c: Case): Entry[] {
  const trace: Entry[] = [];
  let next = 0;
  c.draws.forEach((drawn, number) => {
    while (next < c.steps.length && (c.steps[next] as [number, Step])[0] <= number) {
      trace.push((c.steps[next] as [number, Step])[1]);
      next += 1;
    }
    trace.push({ label: drawn.label, value: drawn.value });
  });
  for (; next < c.steps.length; next += 1) {
    trace.push((c.steps[next] as [number, Step])[1]);
  }
  return trace;
}

/** A provider that serves the values of a trace's entries. */
export class Tracing implements Provider {
  readonly #entries: readonly Entry[];
  #at = 0;
  /**
   * The draws in progress, the innermost last. The first stands for the
   * requests outside every draw, such as the steps of a machine.
   */
  readonly #open: Open[] = [{ queue: [] }];

  /**
   * Returns the provider of the entries of trace, from the first.
   *
   * @param trace - The entries.
   */
  constructor(trace: readonly Entry[]) {
    this.#entries = trace;
  }

  /**
   * Returns the next value of the innermost open draw fitted to the request,
   * or its target.
   *
   * @param request - The request.
   * @returns The value.
   */
  value(request: Request): Value {
    const prepared = (this.#open.at(-1) as Open).queue.shift();
    return prepared === undefined
      ? request.bounds.target
      : request.bounds.coerce(prepared);
  }

  /**
   * Prepares the choices of the entry of a draw under label. A composite
   * takes no entry here. Its draws take theirs, and it takes its own entry
   * once it decodes. A draw through a composite takes the first entry with
   * its label up to the next step entry. Every other draw takes the next
   * entry.
   *
   * @param generator - The draw's generator.
   * @param label - The draw's label.
   * @throws TraceError when the entry is not a draw entry with label, does
   *   not record a value, or has a value that the generator cannot produce.
   */
  drawing(generator: Decoder, label: string): void {
    if (generator instanceof Composite) {
      this.#open.push({ queue: [], byLabel: true });
      return;
    }
    if (this.#at >= this.#entries.length) {
      this.#open.push({ queue: [] });
      return;
    }
    const drawn = generator as Generator<unknown>;
    const at = throughComposite(drawn) ? this.#find(label) : this.#at;
    const entry = this.#entries[at] as Entry;
    if (isStep(entry) || entry.label !== label) {
      throw new TraceError(this.#at, label, "label");
    }
    if (entry.value === UNSTATED) {
      throw new TraceError(at, label, "value");
    }
    const inverted = inverseThrough(drawn, entry.value);
    if (inverted === undefined) {
      throw new TraceError(at, label, "value");
    }
    const [choices, composite] = inverted;
    if (composite) {
      this.#open.push({ queue: choices, end: at });
      return;
    }
    if (at !== this.#at) {
      throw new TraceError(this.#at, label, "label");
    }
    this.#at += 1;
    this.#open.push({ queue: choices });
  }

  /**
   * Ends the draw under label, and takes its entry once it decodes. A
   * composite takes the next entry by its label alone. A draw through a
   * composite takes its entry, which must be the next one, once the draws of
   * its composites have taken the entries before it. Every other draw took
   * its entry before it decoded.
   *
   * @param _generator - The draw's generator.
   * @param label - The draw's label.
   * @throws TraceError when the next entry is not a draw entry with label, or
   *   is not the entry of the draw. When a draw inside took the entry of the
   *   draw, the error is at that entry.
   */
  drawn(_generator: Decoder, label: string): void {
    const ended = this.#open.pop() as Open;
    if (ended.byLabel === true && this.#at < this.#entries.length) {
      this.#take(label);
    }
    if (ended.end !== undefined) {
      if (this.#at !== ended.end) {
        throw new TraceError(Math.min(this.#at, ended.end), label, "label");
      }
      this.#take(label);
    }
  }

  /**
   * Returns the position of the first draw entry with label before a step
   * entry, and the position of the next entry when there is none, so the
   * draw refuses that entry.
   */
  #find(label: string): number {
    for (let at = this.#at; at < this.#entries.length; at += 1) {
      const entry = this.#entries[at] as Entry;
      if (isStep(entry)) {
        break;
      }
      if (entry.label === label) {
        return at;
      }
    }
    return this.#at;
  }

  /**
   * Takes the next entry, a draw entry with label.
   *
   * @param label - The draw's label.
   * @returns The entry.
   * @throws TraceError when the next entry is not a draw entry with label.
   */
  #take(label: string): Draw {
    const entry = this.#entries[this.#at] as Entry;
    if (isStep(entry) || entry.label !== label) {
      throw new TraceError(this.#at, label, "label");
    }
    this.#at += 1;
    return entry;
  }

  /** The number of entries that the draws and the steps took, which is the position of the next entry. */
  get taken(): number {
    return this.#at;
  }

  /** Returns the next entry when it is a step entry. */
  nextStep(): Step | undefined {
    const entry = this.#entries[this.#at];
    return entry !== undefined && isStep(entry) ? entry : undefined;
  }

  /** Returns the actions that the step entries from the next one on name. */
  actions(): Set<string> {
    return new Set(
      this.#entries
        .slice(this.#at)
        .filter(isStep)
        .map((entry) => entry.action),
    );
  }

  /**
   * Serves integer values to the next requests, before any target.
   *
   * @param values - The values.
   */
  prepare(...values: bigint[]): void {
    (this.#open.at(-1) as Open).queue.push(
      ...values.map((value) => ({ kind: "integer", value }) as const),
    );
  }

  /**
   * Takes the next entry, a step entry, and serves the values of its choices.
   *
   * @param values - The values of the step's choices.
   */
  take(...values: bigint[]): void {
    this.prepare(...values);
    this.#at += 1;
  }

  /**
   * Fails on the next entry, a step entry that the machine cannot take.
   *
   * @throws TraceError always.
   */
  refuse(): never {
    throw new TraceError(this.#at, (this.nextStep() as Step).action, "step");
  }
}
