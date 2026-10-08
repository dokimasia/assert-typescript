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
 * The signals that the members raise, Rejected and Failed, and the signals
 * of the case tree end the body, which must let them pass.
 */

import {
  type Bounds,
  type Choice,
  choiceOf,
  IntegerBounds,
  type SequenceBounds,
  UINT64_MAX,
  type Value,
} from "./choice.js";
import * as draw from "./draw.js";
import type { Source } from "./source.js";

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
  [DECODE](c: Case): T;
}

/** The signal that ends a case without a verdict. A rejected case is not counted and not shrunk. */
export class Rejected extends Error {
  /** Returns the signal. */
  constructor() {
    super("prop: the case is rejected");
    this.name = "Rejected";
  }
}

/** The signal of a case that asked for more choices than its cap allows. */
export class Overrun extends Rejected {}

/**
 * A body's failure, with the identity that the shrinker keeps it by. Two
 * failures are the same failure when their identities are equal.
 */
export class Failed extends Error {
  /** The identity of the failure. */
  readonly identity: string;
  /** What the case failed with, such as a failure record, for the run's report. */
  readonly record: unknown;

  /**
   * Returns the failure of identity.
   *
   * @param identity - The identity.
   * @param record - What the case failed with, or undefined.
   */
  constructor(identity: string, record?: unknown) {
    super(`prop: the case fails as ${identity}`);
    this.name = "Failed";
    this.identity = identity;
    this.record = record;
  }
}

/**
 * One choice that a generator asks for. draw generates the value from a
 * source. A choice that decides the structure of what its generator
 * returns, such as a collection's continue flag or a one-of's index, states
 * edge: the value that the edge phase gives it. reuse marks a value of the
 * integer and duration generators, which a generated case may take from an
 * earlier choice with the same bounds.
 */
export interface Request {
  /** The bounds of the choice. */
  readonly bounds: Bounds;
  /** Draws the value from a source. */
  readonly draw: (source: Source) => Value;
  /** The value that the edge phase gives a structure choice, or undefined for a value choice. */
  readonly edge?: bigint | undefined;
  /** Whether a generated case may take the value of an earlier choice with the same bounds. */
  readonly reuse?: boolean | undefined;
}

/** Where a case's values come from. */
export interface Provider {
  /** Returns the value for the request at index of the case. */
  value(request: Request, index: number): Value;
  /** Prepares the values of the draw of generator under label, for a provider that serves a trace. */
  drawing?(generator: Decoder, label: string): void;
  /** Returns the value of the next draw, for a provider that states the values of the draws. */
  valued?(): { readonly value: unknown } | undefined;
}

/** What watches each choice as the case records it: the case tree. */
export interface Observer {
  /** Takes the choice at index, or throws a signal that ends the body. */
  step(index: number, request: Request, value: Value): void;
}

/** One step that a machine took: its action's name, and where it ran. */
export interface Step {
  /** The action's name. */
  readonly action: string;
  /** The client of a step of a concurrent section. */
  readonly client?: number | undefined;
  /** Whether the step is a step of the drain. */
  readonly drain?: boolean | undefined;
}

/**
 * The part of a machine's steps that was running, and its step. part is
 * swarm, setup, sequential, concurrent, drain or settle. position is the
 * step's position in its part, and action the step's action.
 */
export interface Place {
  /** The part. */
  readonly part: string;
  /** The step's position in its part, from 0. */
  readonly position?: number | undefined;
  /** The swarm choice's action or the step's action. */
  readonly action?: string | undefined;
}

/** Where a case made a request or observed a fingerprint. */
export interface Where {
  /** The label of the innermost draw that was running. */
  readonly label?: string | undefined;
  /** The machine's part and step. */
  readonly place?: Place | undefined;
}

/**
 * A provider that draws every value from a random source.
 *
 * A request marked reuse, whose bounds admit more than one value and match
 * the bounds of an earlier reuse request of the same case, first takes
 * `coin(1, 4)`. When it comes up, the value is one of the earlier values
 * with those bounds, chosen with `below(their count)`. Otherwise the
 * request draws as usual. The earlier values are those of the choices that
 * the case's record still contains, so a filter's next attempt never
 * reuses a rejected one.
 */
export class Generating implements Provider {
  readonly #source: Source;
  readonly #earlier = new Map<string, [index: number, value: Value][]>();

  /**
   * Returns the provider that draws from source.
   *
   * @param source - The case's source.
   */
  constructor(source: Source) {
    this.#source = source;
  }

  /**
   * Returns the request's draw from the source, or an earlier value.
   *
   * @param request - The request.
   * @param index - The number of choices in the case's record.
   * @returns The value.
   */
  value(request: Request, index: number): Value {
    for (const kept of this.#earlier.values()) {
      while (kept.length > 0 && (kept.at(-1) as [number, Value])[0] >= index)
        kept.pop();
    }
    const bounds = request.bounds;
    const forced = bounds.kind === "integer" && bounds.lo === bounds.hi;
    if (request.reuse !== true || forced) return request.draw(this.#source);
    let earlier = this.#earlier.get(bounds.id);
    if (earlier === undefined) {
      earlier = [];
      this.#earlier.set(bounds.id, earlier);
    }
    let value: Value;
    if (earlier.length > 0 && this.#source.coin(1n, draw.REUSE_ODDS)) {
      const at = Number(this.#source.below(BigInt(earlier.length)));
      value = (earlier[at] as [number, Value])[1];
    } else {
      value = request.draw(this.#source);
    }
    earlier.push([index, value]);
    return value;
  }
}

/**
 * A provider that reads recorded choices back, in order. A recorded choice
 * that does not fit the request is coerced by the request's bounds, and a
 * request past the last recorded choice takes the target of its bounds.
 */
export class Replaying implements Provider {
  readonly #choices: readonly Choice[];

  /**
   * Returns the provider that replays choices.
   *
   * @param choices - The recorded choices.
   */
  constructor(choices: readonly Choice[]) {
    this.#choices = choices;
  }

  /**
   * Returns the recorded value at index, fitted to the request.
   *
   * @param request - The request.
   * @param index - The number of choices in the case's record.
   * @returns The value.
   */
  value(request: Request, index: number): Value {
    const recorded = this.#choices[index];
    return recorded === undefined
      ? request.bounds.target
      : request.bounds.coerce(recorded);
  }
}

/**
 * A provider that states the values of a case's draws, in order. A draw
 * takes the next value without a choice. A draw past the last value
 * decodes, and every request takes the target of its bounds, as a replay
 * that runs out of choices does.
 */
export class Valuing implements Provider {
  readonly #values: readonly unknown[];
  #at = 0;

  /**
   * Returns the provider that states values for the draws.
   *
   * @param values - The values of the draws, from the first.
   */
  constructor(values: readonly unknown[]) {
    this.#values = values;
  }

  /**
   * Returns the target of the request, which no stated value serves.
   *
   * @param request - The request.
   * @returns The target.
   */
  value(request: Request): Value {
    return request.bounds.target;
  }

  /** Returns the next stated value, or undefined when none is left. */
  valued(): { readonly value: unknown } | undefined {
    if (this.#at === this.#values.length) return undefined;
    this.#at += 1;
    return { value: this.#values[this.#at - 1] };
  }
}

/** The choices that one generator, element or entry made: [start, end). */
export interface Span {
  /** The generator's id, `element` or `entry`. */
  readonly label: string;
  /** The first choice. */
  readonly start: number;
  /** The choice after the last. */
  end: number;
  /** The spans that were open when this one opened. */
  readonly depth: number;
  /** The index of the span that was open when this one opened, or undefined. */
  readonly parent: number | undefined;
}

/** One value that a body drew: its label, its generator and the index of that generator's span. */
export interface Drawn {
  /** The draw's label. */
  readonly label: string;
  /** The value. */
  readonly value: unknown;
  /** The index of the first span that the generator opened. */
  readonly span: number;
  /** The generator. */
  readonly generator: Decoder;
}

/** A point of a case's record, as the lengths of its choices, spans and draws. */
export interface Mark {
  readonly choices: number;
  readonly spans: number;
  readonly draws: number;
}

/** Returns what a value counts towards the cap: one, plus each element of a sequence. */
function cost(value: Value): number {
  return Array.isArray(value) ? 1 + value.length : 1;
}

/** The bounds of the values of rand(): the whole unsigned 64-bit range. */
const RANDOM = new IntegerBounds(0n, UINT64_MAX);

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
    const bounds = request.bounds;
    if (
      bounds.kind === "sequence" &&
      this.#cost + 1 + bounds.minSize > this.#maxChoices
    ) {
      throw new Overrun();
    }
    const value = this.#provider.value(request, this.choices.length);
    this.#cost += cost(value);
    if (this.#cost > this.#maxChoices) throw new Overrun();
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
    if (!condition) throw new Rejected();
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
    if (best === undefined || score > best) this.targets.set(label, score);
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
}
