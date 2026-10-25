// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The generators that contain other generators: one-of, optional, list,
 * dict, composite and recursive, with a position of a recursive value.
 */

import { type Case, DECODE } from "../case.js";
import { IntegerBounds } from "../choice.js";
import { collect, ELEMENT, ENTRY, type Sizes } from "../collection.js";
import { canonical, Pairs } from "../value.js";
import { Generator } from "./base.js";
import { BIT } from "./scalars.js";

/** The bounds of a choice that admits 0 alone. */
const NONE = new IntegerBounds(0n, 0n);

/** A value of one of the generators: an index that decides structure, then that generator's choices. */
export class OneOf<T> extends Generator<T> {
  static readonly ID = "one-of";
  /** The alternatives, at least one. */
  readonly of: readonly Generator<T>[];
  readonly #bounds: IntegerBounds;

  /**
   * Returns the generator of a value of one of of.
   *
   * @param of - The alternatives, at least one.
   */
  constructor(of: readonly Generator<T>[]) {
    super();
    this.of = of;
    this.#bounds = new IntegerBounds(0n, BigInt(of.length - 1));
  }

  /** Returns the value that the chosen generator decodes. */
  [DECODE](c: Case): T {
    return c.span(OneOf.ID, () =>
      (this.of[Number(c.integer(this.#bounds, 0n))] as Generator<T>)[DECODE](c),
    );
  }
}

/**
 * A value or undefined: a presence choice in [0, 1], then the value when
 * present. The presence choice decides structure. Its target is absent, and
 * the edge phase makes it present.
 */
export class Optional<T> extends Generator<T | undefined> {
  static readonly ID = "optional";
  /** The generator of the value. */
  readonly of: Generator<T>;

  /**
   * Returns the generator of a value of of, or undefined.
   *
   * @param of - The generator of the value.
   */
  constructor(of: Generator<T>) {
    super();
    this.of = of;
  }

  /** Returns undefined when absent, and the decoded value when present. */
  [DECODE](c: Case): T | undefined {
    return c.span(Optional.ID, () =>
      c.integer(BIT, 1n) === 1n ? this.of[DECODE](c) : undefined,
    );
  }
}

/**
 * A list of the element generator's values. With unique set, an element
 * equal under canonical to an earlier one is discarded, as
 * collection.collect states.
 */
export class List<T> extends Generator<T[]> {
  static readonly ID = "list";
  /** The generator of the elements. */
  readonly of: Generator<T>;
  /** The sizes. */
  readonly sizes: Sizes;
  /** Whether the elements are unique. */
  readonly unique: boolean;

  /**
   * Returns the generator of lists of of.
   *
   * @param of - The generator of the elements.
   * @param sizes - The sizes.
   * @param unique - Whether the elements are unique.
   */
  constructor(of: Generator<T>, sizes: Sizes, unique = false) {
    super();
    this.of = of;
    this.sizes = sizes;
    this.unique = unique;
  }

  /** Returns the list that the case's flags and elements decode to. */
  [DECODE](c: Case): T[] {
    return c.span(List.ID, () =>
      collect(c, this.sizes, ELEMENT, () => {
        const value = this.of[DECODE](c);
        return [value, this.unique ? canonical(value) : undefined] as const;
      }),
    );
  }
}

/**
 * Entries of a key and a value, with distinct keys. An entry whose key
 * equals an earlier key under canonical is discarded, as collection.collect
 * states.
 */
export class Dict<K, V> extends Generator<Pairs> {
  static readonly ID = "dict";
  /** The generator of the keys. */
  readonly keys: Generator<K>;
  /** The generator of the values. */
  readonly values: Generator<V>;
  /** The sizes. */
  readonly sizes: Sizes;

  /**
   * Returns the generator of dicts from keys to values.
   *
   * @param keys - The generator of the keys.
   * @param values - The generator of the values.
   * @param sizes - The sizes.
   */
  constructor(keys: Generator<K>, values: Generator<V>, sizes: Sizes) {
    super();
    this.keys = keys;
    this.values = values;
    this.sizes = sizes;
  }

  /** Returns the entries that the case's flags, keys and values decode to. */
  [DECODE](c: Case): Pairs {
    return c.span(Dict.ID, () => {
      const entries = collect(c, this.sizes, ENTRY, () => {
        const key = this.keys[DECODE](c);
        const entry = [key, this.values[DECODE](c)] as const;
        return [entry, canonical(key)] as const;
      });
      return new Pairs(entries);
    });
  }
}

/** The value of a function that draws from other generators, in one span. */
export class Composite<T> extends Generator<T> {
  static readonly ID = "composite";
  /** The function. */
  readonly f: (c: Case) => T;

  /**
   * Returns the generator of the values that f returns.
   *
   * @param f - The function, which draws from the case.
   */
  constructor(f: (c: Case) => T) {
    super();
    this.f = f;
  }

  /** Returns the value of the function. */
  [DECODE](c: Case): T {
    return c.span(Composite.ID, () => this.f(c));
  }
}

/**
 * A base value, or an extension whose positions are recursive values. Each
 * position decides between the base, 0, and the extension, 1, with an
 * integer choice that decides structure. Once one value has drawn maxLeaves
 * values from the base, every further position takes the base, with bounds
 * [0, 0]. A Position inside the extension is one position.
 *
 * The count of leaves belongs to the decode in progress, so a recursive
 * generator decodes one case at a time.
 */
export class Recursive<T> extends Generator<T> {
  static readonly ID = "recursive";
  /** The base. */
  readonly base: Generator<T>;
  /** The values that one value may draw from the base. */
  readonly maxLeaves: number;
  /** The extension. */
  readonly extend: Generator<T>;
  readonly #leaves: number[] = [];

  /**
   * Returns the generator of recursive values.
   *
   * @param base - The base.
   * @param maxLeaves - The values that one value may draw from the base, at least 1.
   * @param extend - Returns the extension from the generator of one position.
   */
  constructor(
    base: Generator<T>,
    maxLeaves: number,
    extend: (self: Generator<T>) => Generator<T>,
  ) {
    super();
    this.base = base;
    this.maxLeaves = maxLeaves;
    this.extend = extend(new Position(this));
  }

  /** Returns one recursive value, counting its leaves from zero. */
  [DECODE](c: Case): T {
    this.#leaves.push(0);
    try {
      return this.position(c);
    } finally {
      this.#leaves.pop();
    }
  }

  /**
   * Decodes one position of the value being decoded.
   *
   * @param c - The case.
   * @returns The value of the position.
   */
  position(c: Case): T {
    const exhausted = (this.#leaves.at(-1) as number) >= this.maxLeaves;
    return c.span(Recursive.ID, () => {
      if (c.integer(exhausted ? NONE : BIT, 0n) === 1n) {
        return this.extend[DECODE](c);
      }
      this.#leaves.push((this.#leaves.pop() as number) + 1);
      return this.base[DECODE](c);
    });
  }
}

/** A position of the recursive value being decoded, inside its extension. */
export class Position<T> extends Generator<T> {
  /** The recursive generator. */
  readonly owner: Recursive<T>;

  /**
   * Returns the position of owner's value.
   *
   * @param owner - The recursive generator.
   */
  constructor(owner: Recursive<T>) {
    super();
    this.owner = owner;
  }

  /** Decodes the next position of the owner's value. */
  [DECODE](c: Case): T {
    return this.owner.position(c);
  }
}
