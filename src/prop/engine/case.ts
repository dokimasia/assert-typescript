// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * A case: the choices that one call of a body makes, recorded with their
 * spans.
 *
 * A generator never reads the random source itself. It asks the case for a
 * choice with bounds, and the case's provider supplies the value: drawn from
 * the source while generating, read back from recorded choices while
 * replaying, given by the edge phase, or decoded from a fuzzer's bytes by
 * the bridge. The case records every value with its request and the spans
 * of the generators that asked for it. The shrinker edits that record.
 *
 * The signals that the members raise, Rejected and Failed, the signal
 * Skipped and the signals of the case tree end the body, which must let them
 * pass.
 */

import type { Provider, Request } from "./case/providers.js";
import type { Drawn, Mark, Observer, Place, Span, Step, Where } from "./case/record.js";
import { Failed, Overrun, Rejected, Skipped } from "./case/signals.js";
import {
  type Choice,
  choiceOf,
  IntegerBounds,
  type SequenceBounds,
  UINT64_MAX,
  type Value,
} from "./choice.js";
import * as draw from "./draw.js";

/** Returns what a value counts towards the cap: one, plus each element of a sequence. */
function cost(value: Value): number {
  return Array.isArray(value) ? 1 + value.length : 1;
}

/** The bounds of the values of rand(): the whole unsigned 64-bit range. */
const RANDOM = new IntegerBounds(0n, UINT64_MAX);

/** The most choices that one case may make. A sequence counts as one choice plus one for each element. */
export const MAX_CHOICES = 8192;

/** The key of the method that decodes a value of a generator from a case. */
export const DECODE = Symbol("decode");

/** A domain, and how to decode one of its values from a case. */
export interface Decoder<T = unknown> {
  /**
   * Asks the case for choices and returns the value that they decode to.
   *
   * @throws Rejected when the choices decode to no value of the domain.
   */
  [DECODE]: (c: Case) => T;
}

/**
 * The record of one call of a body. wheres states where the case made each
 * recorded request, and observed where it observed each fingerprint. A
 * machine's steps set place while they run.
 */
export class Case {
  readonly #provider: Provider;
  readonly #maxChoices: number;
  readonly #observer: Observer | undefined;
  #cost = 0;
  readonly #open: number[] = [];
  readonly #drawing: string[] = [];
  /** The recorded choices. */
  readonly choices: Choice[] = [];
  /** The request of each recorded choice. */
  readonly requests: Request[] = [];
  /** The spans, in the order they opened. */
  readonly spans: Span[] = [];
  /** The draws, in order. */
  readonly draws: Drawn[] = [];
  /** The steps of a machine, each after the number of draws recorded before it. */
  readonly steps: [draws: number, step: Step][] = [];
  /** The labels that classify counted. */
  readonly labels = new Set<string>();
  /** The notes. */
  readonly notes: string[] = [];
  /** The observed fingerprints. */
  readonly fingerprints: bigint[] = [];
  /** The highest score that the case recorded under each label. */
  readonly targets = new Map<string, number>();
  /** Where the case made each recorded request. */
  readonly wheres: Where[] = [];
  /** Where the case observed each fingerprint. */
  readonly observed: Where[] = [];
  /** The machine's part and step, while its steps run. */
  place: Place | undefined;

  /**
   * Returns an empty case whose values come from provider.
   *
   * @param provider - Where the values come from.
   * @param maxChoices - The most choices that the case may make.
   * @param observer - What sees every choice after the case records it.
   */
  constructor(provider: Provider, maxChoices = MAX_CHOICES, observer?: Observer) {
    this.#provider = provider;
    this.#maxChoices = maxChoices;
    this.#observer = observer;
  }

  /** Where the case's values come from, which a machine's steps read a trace from. */
  get provider(): Provider {
    return this.#provider;
  }

  /** Returns where the case is: the open draw's label and the machine's place. */
  where(): Where {
    return { label: this.#drawing.at(-1), place: this.place };
  }

  /**
   * Returns the value for request and records it. A sequence whose minimum
   * length alone takes the case past its cap ends the case before the
   * provider makes its value.
   *
   * @param request - The request.
   * @returns The value.
   * @throws Overrun when the value takes the case past its cap.
   */
  choose(request: Request): Value {
    const { bounds } = request;
    if (
      bounds.kind === "sequence" &&
      this.#cost + 1 + bounds.minSize > this.#maxChoices
    ) {
      throw new Overrun();
    }
    const value = this.#provider.value(request, this.choices.length);
    this.#cost += cost(value);
    if (this.#cost > this.#maxChoices) {
      throw new Overrun();
    }
    this.choices.push(choiceOf(bounds, value));
    this.requests.push(request);
    this.wheres.push(this.where());
    this.#observer?.step(this.choices.length - 1, request, value);
    return value;
  }

  /**
   * Returns an integer choice inside bounds, drawn as draw.integer draws.
   *
   * @param bounds - The bounds.
   * @param edge - The value that the edge phase gives a structure choice.
   * @param reuse - Whether a generated case may take an earlier value.
   * @returns The value.
   * @throws Overrun when the choice takes the case past its cap.
   */
  integer(bounds: IntegerBounds, edge?: bigint, reuse = false): bigint {
    return this.choose({
      bounds,
      draw: (source) => draw.integer(source, bounds),
      edge,
      reuse,
    }) as bigint;
  }

  /**
   * Returns a sequence choice inside bounds, drawn as draw.sequence draws.
   *
   * @param bounds - The bounds.
   * @returns The elements.
   * @throws Overrun when the sequence takes the case past its cap.
   */
  sequence(bounds: SequenceBounds): readonly number[] {
    return this.choose({
      bounds,
      draw: (source) => draw.sequence(source, bounds),
    }) as readonly number[];
  }

  /**
   * Records the choices that fn makes as one span, and returns what fn
   * returns.
   *
   * @param label - The span's label.
   * @param fn - The decoding inside the span.
   * @param start - The span's first choice, an index that the case recorded
   *   before fn, so that an element's span can include the continue flag
   *   decided before it. The current index when undefined.
   * @returns The value of fn.
   */
  span<T>(label: string, fn: () => T, start?: number): T {
    const close = this.open(label, start);
    try {
      return fn();
    } finally {
      close();
    }
  }

  /**
   * Opens a span and returns the function that closes it, for a span that is
   * open while the case awaits, as the span of a machine's step is open
   * around the step's action. Spans close in the reverse order that they
   * open.
   *
   * @param label - The span's label.
   * @param start - The span's first choice, as span states it.
   * @returns The function that closes the span at the current index.
   */
  open(label: string, start?: number): () => void {
    const parent = this.#open.at(-1);
    const index = this.spans.length;
    const first = start ?? this.choices.length;
    this.spans.push({
      label,
      start: first,
      end: first,
      depth: this.#open.length,
      parent,
    });
    this.#open.push(index);
    return () => {
      this.#open.pop();
      (this.spans[index] as Span).end = this.choices.length;
    };
  }

  /** Returns the current point of the record, for rewind. */
  mark(): Mark {
    return {
      choices: this.choices.length,
      spans: this.spans.length,
      draws: this.draws.length,
    };
  }

  /**
   * Removes every choice, span and draw recorded after mark. Every span
   * opened after mark must have closed. The removed choices still count
   * towards the cap, and an observer keeps them: the case tree walked them,
   * and a removal cannot unwalk a step.
   *
   * @param mark - A point of the record.
   */
  rewind(mark: Mark): void {
    this.choices.length = mark.choices;
    this.requests.length = mark.choices;
    this.wheres.length = mark.choices;
    this.spans.length = mark.spans;
    this.draws.length = mark.draws;
  }

  /**
   * Returns a value of generator and records it under label. The draw's
   * span is the first span that the generator opens. Two draws may share a
   * label. A provider that serves a trace prepares the draw's values first,
   * and a provider that states the values of the draws gives the draw its
   * value, which makes no choice and opens no span. Every request of the
   * draw is made under its label.
   *
   * @param generator - The generator.
   * @param label - The draw's label.
   * @returns The value.
   */
  draw<T>(generator: Decoder<T>, label: string): T {
    const stated = this.#provider.valued?.();
    if (stated !== undefined) {
      this.draws.push({
        label,
        value: stated.value,
        span: this.spans.length,
        generator,
      });
      return stated.value as T;
    }
    this.#provider.drawing?.(generator, label);
    const span = this.spans.length;
    this.#drawing.push(label);
    let value: T;
    try {
      value = generator[DECODE](this);
    } finally {
      this.#drawing.pop();
    }
    this.draws.push({ label, value, span, generator });
    return value;
  }

  /**
   * Records a step that a machine took, after every draw recorded so far.
   *
   * @param taken - The step.
   */
  step(taken: Step): void {
    this.steps.push([this.draws.length, taken]);
  }

  /**
   * Rejects the case when condition is false.
   *
   * @param condition - The condition.
   * @throws Rejected when condition is false.
   */
  assume(condition: boolean): void {
    if (!condition) {
      throw new Rejected();
    }
  }

  /**
   * Counts the case under label. A label counted twice counts once.
   *
   * @param label - The label.
   */
  classify(label: string): void {
    this.labels.add(label);
  }

  /**
   * Attaches message to the case. Only a failing case reports it.
   *
   * @param message - The note.
   */
  note(message: string): void {
    this.notes.push(message);
  }

  /**
   * Records a fingerprint of the subject's state, for a replay to compare.
   *
   * @param fingerprint - The fingerprint.
   */
  observe(fingerprint: bigint): void {
    this.fingerprints.push(fingerprint);
    this.observed.push(this.where());
  }

  /**
   * Records score under label. Of two scores under one label, the case
   * keeps the higher.
   *
   * @param label - The label.
   * @param score - The score.
   */
  target(label: string, score: number): void {
    const best = this.targets.get(label);
    if (best === undefined || score > best) {
      this.targets.set(label, score);
    }
  }

  /** Returns an integer choice over the whole unsigned 64-bit range. */
  random(): bigint {
    return this.integer(RANDOM);
  }

  /**
   * Fails the case.
   *
   * @param identity - The failure's identity.
   * @param record - What the case fails with, for the run's report.
   * @throws Failed always.
   */
  fail(identity: string, record?: unknown): never {
    throw new Failed(identity, record);
  }

  /**
   * Skips the run of the case's property.
   *
   * @param reason - Why the case skips.
   * @throws Skipped always.
   */
  skip(reason: string): never {
    throw new Skipped(reason);
  }
}
