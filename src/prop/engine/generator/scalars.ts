// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The generators that contain no other generator: integer, float, boolean,
 * just, sampled-from, string, bytes, string-matching and permutation.
 */

import * as alphabet from "../alphabet.js";
import { type Case, DECODE } from "../case.js";
import { type FloatBounds, IntegerBounds, type SequenceBounds } from "../choice.js";
import * as draw from "../draw.js";
import { Generator } from "./base.js";

/** The values of a byte: the element values of the sequence of a byte string. */
export const BYTE_VALUES = 256;

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
    const { bounds } = this;
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
    const { p } = this;
    return c.span(
      Bool.ID,
      () => c.choose({ bounds: BIT, draw: (source) => draw.boolean(source, p) }) === 1n,
    );
  }
}

/** The bounds of a choice of 0 or 1. */
export const BIT = new IntegerBounds(0n, 1n);

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
    const { characters } = this;
    if (characters === undefined) {
      return indices.map(alphabet.character).join("");
    }
    return indices.map((i) => characters[i] as string).join("");
  }
}

/** A byte string: one sequence of {@link BYTE_VALUES} element values. */
export class Bytes extends Generator<Uint8Array> {
  static readonly ID = "bytes";
  /** The bounds of the sequence. */
  readonly bounds: SequenceBounds;

  /**
   * Returns the generator of byte strings.
   *
   * @param bounds - The bounds of the sequence, with k of {@link BYTE_VALUES}.
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
  emit: (c: Case, out: string[]) => void;
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
