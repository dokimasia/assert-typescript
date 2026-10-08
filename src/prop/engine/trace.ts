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
 * - A machine turns each step entry into the choices of one step, which
 *   Tracing serves as they are requested.
 * - Every other request takes its target.
 *
 * A trace that the body cannot follow throws TraceError, which names the
 * entry. The error is not a failure of the case: it ends the run before any
 * case runs.
 */

import type { Case, Decoder, Provider, Request, Step } from "./case.js";
import type { Choice, Value } from "./choice.js";
import type { Generator } from "./generator.js";
import { inverseOf } from "./inverse.js";

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
  for (; next < c.steps.length; next += 1)
    trace.push((c.steps[next] as [number, Step])[1]);
  return trace;
}

/** A provider that serves the values of a trace's entries. */
export class Tracing implements Provider {
  readonly #entries: readonly Entry[];
  #at = 0;
  readonly #queue: Choice[] = [];

  /**
   * Returns the provider of the entries of trace, from the first.
   *
   * @param trace - The entries.
   */
  constructor(trace: readonly Entry[]) {
    this.#entries = trace;
  }

  /**
   * Returns the next prepared value fitted to the request, or its target.
   *
   * @param request - The request.
   * @returns The value.
   */
  value(request: Request): Value {
    const prepared = this.#queue.shift();
    return prepared === undefined
      ? request.bounds.target
      : request.bounds.coerce(prepared);
  }

  /**
   * Prepares the choices of the next entry for a draw under label.
   *
   * @param generator - The draw's generator.
   * @param label - The draw's label.
   * @throws TraceError when the next entry is no draw entry with label, or
   *   the generator cannot produce its value.
   */
  drawing(generator: Decoder, label: string): void {
    const entry = this.#entries[this.#at];
    if (entry === undefined) return;
    if (isStep(entry) || entry.label !== label)
      throw new TraceError(this.#at, label, "label");
    const choices = inverseOf(generator as Generator<unknown>, entry.value);
    if (choices === undefined) throw new TraceError(this.#at, label, "value");
    this.#queue.push(...choices);
    this.#at += 1;
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
    this.#queue.push(...values.map((value) => ({ kind: "integer", value }) as const));
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
