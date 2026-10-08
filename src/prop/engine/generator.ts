/**
 * The generators, decoded from a case.
 *
 * A generator's decode asks the case for its choices in a fixed order and
 * returns the value that they decode to. The order of the requests, their
 * bounds, which of them decide structure, and the spans around them are
 * the definition's. Two implementations that agree on them decode the same
 * value from the same choices.
 *
 * Every generator but a map decodes inside a span labelled with its id. A
 * map makes its source's choices and opens no span of its own. A list and a
 * dict decode their elements as collection.collect states, each in a span
 * that starts at the element's continue flag.
 */

import * as alphabet from "./alphabet.js";
import { type Case, DECODE, type Decoder } from "./case.js";
import { type FloatBounds, IntegerBounds, type SequenceBounds } from "./choice.js";
import { collect, ELEMENT, ENTRY, type Sizes } from "./collection.js";
import * as draw from "./draw.js";
import { canonical, Pairs } from "./value.js";

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

/** An integer in its bounds: one integer choice, which may reuse an earlier one. */
export class Integer extends Generator<bigint> {
  /** The id of the generator: `integer`, or `duration` for a duration in nanoseconds. */
  readonly id: string;
  /** The bounds. */
  readonly bounds: IntegerBounds;

  /**
   * Returns the generator of the integers in bounds.
   *
   * @param bounds - The bounds.
   * @param id - The id of the span: `integer` or `duration`.
   */
  constructor(bounds: IntegerBounds, id = "integer") {
    super();
    this.bounds = bounds;
    this.id = id;
  }

  /** Returns the integer that the case chooses. */
  [DECODE](c: Case): bigint {
    return c.span(this.id, () => c.integer(this.bounds, undefined, true));
  }
}

/** A float in its bounds: one float choice. */
export class Float extends Generator<number> {
  static readonly ID = "float";
  /** The bounds. */
  readonly bounds: FloatBounds;

  /**
   * Returns the generator of the floats in bounds.
   *
   * @param bounds - The bounds.
   */
  constructor(bounds: FloatBounds) {
    super();
    this.bounds = bounds;
  }

  /** Returns the float that the case chooses. */
  [DECODE](c: Case): number {
    const bounds = this.bounds;
    return c.span(
      Float.ID,
      () =>
        c.choose({
          bounds,
          draw: (source) => draw.floatValue(source, bounds),
        }) as number,
    );
  }
}

/** True with probability p: one integer choice in [0, 1], drawn by one coin. */
export class Bool extends Generator<boolean> {
  static readonly ID = "boolean";
  /** The probability of true, in lowest terms. */
  readonly p: draw.Rational;

  /**
   * Returns the generator of booleans that are true with probability p.
   *
   * @param p - The probability, in lowest terms.
   */
  constructor(p: draw.Rational) {
    super();
    this.p = p;
  }

  /** Returns whether the case chooses 1. */
  [DECODE](c: Case): boolean {
    const p = this.p;
    return c.span(
      Bool.ID,
      () => c.choose({ bounds: BIT, draw: (source) => draw.boolean(source, p) }) === 1n,
    );
  }
}

/** The bounds of a choice of 0 or 1. */
const BIT = new IntegerBounds(0n, 1n);

/** One stated value. It makes no choice. */
export class Just<T> extends Generator<T> {
  static readonly ID = "just";
  /** The value. */
  readonly value: T;

  /**
   * Returns the generator of value.
   *
   * @param value - The value.
   */
  constructor(value: T) {
    super();
    this.value = value;
  }

  /** Returns the stated value. */
  [DECODE](c: Case): T {
    return c.span(Just.ID, () => this.value);
  }
}

/** One of the stated values: an integer index that decides structure. */
export class SampledFrom<T> extends Generator<T> {
  static readonly ID = "sampled-from";
  /** The values, at least one. */
  readonly values: readonly T[];
  readonly #bounds: IntegerBounds;

  /**
   * Returns the generator of one of values.
   *
   * @param values - The values, at least one.
   */
  constructor(values: readonly T[]) {
    super();
    this.values = values;
    this.#bounds = new IntegerBounds(0n, BigInt(values.length - 1));
  }

  /** Returns the value at the index that the case chooses. */
  [DECODE](c: Case): T {
    return c.span(
      SampledFrom.ID,
      () => this.values[Number(c.integer(this.#bounds, 0n))] as T,
    );
  }
}

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

/**
 * A string: one sequence of indices into its alphabet. An undefined
 * alphabet selects the default one. Otherwise the alphabet is the stated
 * characters in their order, so the first character is the simplest.
 */
export class Text extends Generator<string> {
  static readonly ID = "string";
  /** The characters of a stated alphabet, or undefined for the default one. */
  readonly characters: readonly string[] | undefined;
  /** The bounds of the sequence. */
  readonly bounds: SequenceBounds;

  /**
   * Returns the generator of strings over characters.
   *
   * @param characters - The characters of a stated alphabet, each one code
   *   point, or undefined for the default alphabet.
   * @param bounds - The bounds of the sequence.
   */
  constructor(characters: readonly string[] | undefined, bounds: SequenceBounds) {
    super();
    this.characters = characters;
    this.bounds = bounds;
  }

  /** Returns the string that the case's sequence spells. */
  [DECODE](c: Case): string {
    const indices = c.span(Text.ID, () => c.sequence(this.bounds));
    const characters = this.characters;
    if (characters === undefined) return indices.map(alphabet.character).join("");
    return indices.map((i) => characters[i] as string).join("");
  }
}

/** A byte string: one sequence of 256 element values. */
export class Bytes extends Generator<Uint8Array> {
  static readonly ID = "bytes";
  /** The bounds of the sequence. */
  readonly bounds: SequenceBounds;

  /**
   * Returns the generator of byte strings.
   *
   * @param bounds - The bounds of the sequence, with k of 256.
   */
  constructor(bounds: SequenceBounds) {
    super();
    this.bounds = bounds;
  }

  /** Returns the bytes that the case's sequence contains. */
  [DECODE](c: Case): Uint8Array {
    return Uint8Array.from(c.span(Bytes.ID, () => c.sequence(this.bounds)));
  }
}

/** A piece of a pattern, which decodes characters from a case. */
export interface Piece {
  /** Asks the case for this piece's choices and appends its characters to out. */
  emit(c: Case, out: string[]): void;
}

/** A string that a pattern of the portable subset matches in full. */
export class Matching extends Generator<string> {
  static readonly ID = "string-matching";
  /** The pattern's piece. */
  readonly piece: Piece;

  /**
   * Returns the generator of the strings that piece decodes.
   *
   * @param piece - The pattern's piece.
   */
  constructor(piece: Piece) {
    super();
    this.piece = piece;
  }

  /** Returns the characters that the pattern's pieces decode. */
  [DECODE](c: Case): string {
    const out: string[] = [];
    c.span(Matching.ID, () => this.piece.emit(c, out));
    return out.join("");
  }
}

/**
 * An ordering of the stated values: one swap choice per position. Position
 * i, for i from 0 to n − 2, swaps with the index that the case chooses in
 * [i, n − 1]. The target of that choice is i, so the targets leave the
 * values in their stated order.
 */
export class Permutation<T> extends Generator<T[]> {
  static readonly ID = "permutation";
  /** The values. */
  readonly values: readonly T[];

  /**
   * Returns the generator of orderings of values.
   *
   * @param values - The values.
   */
  constructor(values: readonly T[]) {
    super();
    this.values = values;
  }

  /** Returns the values in the order that the case's swaps leave them. */
  [DECODE](c: Case): T[] {
    const ordered = [...this.values];
    const last = ordered.length - 1;
    c.span(Permutation.ID, () => {
      for (let i = 0; i < last; i += 1) {
        const j = Number(c.integer(new IntegerBounds(BigInt(i), BigInt(last))));
        [ordered[i], ordered[j]] = [ordered[j] as T, ordered[i] as T];
      }
    });
    return ordered;
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
      if (this.keep(value)) return value;
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
      if (c.integer(exhausted ? NONE : BIT, 0n) === 1n) return this.extend[DECODE](c);
      this.#leaves.push((this.#leaves.pop() as number) + 1);
      return this.base[DECODE](c);
    });
  }
}

/** The bounds of a choice that admits 0 alone. */
const NONE = new IntegerBounds(0n, 0n);

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
