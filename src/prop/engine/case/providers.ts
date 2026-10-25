// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Where the values of a case come from: a random source, recorded choices,
 * or stated values of the draws.
 */

import type { Decoder } from "../case.js";
import type { Bounds, Choice, Value } from "../choice.js";
import * as draw from "../draw.js";
import type { Source } from "../source.js";

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
  value: (request: Request, index: number) => Value;
  /** Prepares the values of the draw of generator under label, for a provider that serves a trace. */
  drawing?: (generator: Decoder, label: string) => void;
  /** Returns the value of the next draw, for a provider that states the values of the draws. */
  valued?: () => { readonly value: unknown } | undefined;
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
      while (kept.length > 0 && (kept.at(-1) as [number, Value])[0] >= index) {
        kept.pop();
      }
    }
    const { bounds } = request;
    const forced = bounds.kind === "integer" && bounds.lo === bounds.hi;
    if (request.reuse !== true || forced) {
      return request.draw(this.#source);
    }
    let earlier = this.#earlier.get(bounds.id);
    if (earlier === undefined) {
      earlier = [];
      this.#earlier.set(bounds.id, earlier);
    }
    let value: Value;
    if (earlier.length > 0 && this.#source.coin(1n, draw.REUSE_ODDS)) {
      const at = Number(this.#source.below(BigInt(earlier.length)));
      [, value] = earlier[at] as [number, Value];
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
    if (this.#at === this.#values.length) {
      return undefined;
    }
    this.#at += 1;
    return { value: this.#values[this.#at - 1] };
  }
}
