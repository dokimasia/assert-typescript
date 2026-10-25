// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The base of every generator, with the generators that its methods
 * return: a map, a filter and a bind.
 */

import { type Case, DECODE, type Decoder } from "../case.js";

/** The attempts that a filter makes in all before it rejects the case. */
const FILTER_ATTEMPTS = 3;

/** A domain of values of type T, and how to decode one of them from a case. */
export abstract class Generator<T> implements Decoder<T> {
  /**
   * Asks the case for choices and returns the value that they decode to.
   *
   * @throws Rejected when the choices decode to no value of the domain.
   */
  abstract [DECODE](c: Case): T;

  /**
   * Returns the generator of f of each value of this one. It makes this
   * generator's choices, so it shrinks as this generator does. It has no
   * inverse, so an example of it runs on its value.
   *
   * @param f - The function of a value.
   * @returns The generator.
   */
  map<U>(f: (value: T) => U): Generator<U> {
    return new Mapped(this, f);
  }

  /**
   * Returns the generator of the values of this one that keep accepts. It
   * tries three times in all, and rejects the case when keep accepts no
   * attempt.
   *
   * @param keep - The predicate.
   * @returns The generator.
   */
  filter(keep: (value: T) => boolean): Generator<T> {
    return new Filter(this, keep);
  }

  /**
   * Returns the generator that decodes a value of this one, then a value of
   * the generator that f returns for it, in one span.
   *
   * @param f - The function from a value to a generator.
   * @returns The generator.
   */
  bind<U>(f: (value: T) => Generator<U>): Generator<U> {
    return new Bound(this, f);
  }
}

/**
 * A value of the source generator that a predicate keeps. Each attempt
 * decodes in a span labelled with the id. A rejected attempt is removed
 * from the case's record, so a replay of the record decodes the kept value
 * at its first attempt. The removed choices still count towards the case's
 * cap, and the case tree keeps them. The filter tries three times in all,
 * and rejects the case when the predicate is false of the last attempt too.
 */
export class Filter<T> extends Generator<T> {
  static readonly ID = "filter";
  /** The source generator. */
  readonly of: Generator<T>;
  /** The predicate. */
  readonly keep: (value: T) => boolean;

  /**
   * Returns the generator of the values of of that keep accepts.
   *
   * @param of - The source generator.
   * @param keep - The predicate.
   */
  constructor(of: Generator<T>, keep: (value: T) => boolean) {
    super();
    this.of = of;
    this.keep = keep;
  }

  /** Returns the first attempt's value that the predicate keeps. */
  [DECODE](c: Case): T {
    const mark = c.mark();
    let value = this.#attempt(c);
    for (let attempt = 1; attempt < FILTER_ATTEMPTS; attempt += 1) {
      if (this.keep(value)) {
        return value;
      }
      c.rewind(mark);
      value = this.#attempt(c);
    }
    c.assume(this.keep(value));
    return value;
  }

  /** Decodes one attempt in its own span. */
  #attempt(c: Case): T {
    return c.span(Filter.ID, () => this.of[DECODE](c));
  }
}

/**
 * The value that a function returns for the source's value. It makes the
 * source's choices and opens no span of its own. With back, the inverse of
 * the function, it runs backwards.
 */
export class Mapped<T, U> extends Generator<U> {
  /** The source generator. */
  readonly of: Generator<T>;
  /** The function. */
  readonly f: (value: T) => U;
  /**
   * The inverse of the function, or undefined for a function that the
   * engine cannot run backwards. It throws for a value that f does not
   * return.
   */
  readonly back: ((value: U) => T) | undefined;

  /**
   * Returns the generator of f of the values of of.
   *
   * @param of - The source generator.
   * @param f - The function.
   * @param back - The inverse of the function, or undefined.
   */
  constructor(of: Generator<T>, f: (value: T) => U, back?: (value: U) => T) {
    super();
    this.of = of;
    this.f = f;
    this.back = back;
  }

  /** Returns the function of the value that the source decodes. */
  [DECODE](c: Case): U {
    return this.f(this.of[DECODE](c));
  }
}

/** A value of the source, then a value of the generator that a function returns for it, in one span. */
export class Bound<T, U> extends Generator<U> {
  static readonly ID = "bind";
  /** The source generator. */
  readonly of: Generator<T>;
  /** The function from a value to a generator. */
  readonly f: (value: T) => Generator<U>;

  /**
   * Returns the generator of the values of the generators that f returns.
   *
   * @param of - The source generator.
   * @param f - The function from a value to a generator.
   */
  constructor(of: Generator<T>, f: (value: T) => Generator<U>) {
    super();
    this.of = of;
    this.f = f;
  }

  /** Returns the value of the second generator. */
  [DECODE](c: Case): U {
    return c.span(Bound.ID, () => this.f(this.of[DECODE](c))[DECODE](c));
  }
}
