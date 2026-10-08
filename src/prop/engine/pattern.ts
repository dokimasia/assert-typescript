/**
 * The pieces of a pattern of the portable subset, decoded from a case.
 *
 * Each piece decodes in a fixed way. An alternation of two or more branches
 * chooses one with an integer that decides structure. A quantifier decodes
 * its repetitions as a collection. A class chooses a character with an
 * integer index over its members, in the order of the default alphabet. The
 * targets give the first branch of each alternation, the fewest
 * repetitions, and the simplest character of each class.
 */

import { type Node, parse } from "../../pattern/parse.js";
import * as alphabet from "./alphabet.js";
import type { Case } from "./case.js";
import { IntegerBounds } from "./choice.js";
import { collect, ELEMENT, Sizes } from "./collection.js";
import type { Piece } from "./generator.js";

/** The span labels of an alternation and of a quantifier's repetitions. */
const ALTERNATION = "alternation";
const REPEAT = "repeat";

/** One character, which makes no choice. */
export class Literal implements Piece {
  /** The character. */
  readonly char: string;

  /**
   * Returns the piece of char.
   *
   * @param char - One code point.
   */
  constructor(char: string) {
    this.char = char;
  }

  /** Appends the character. */
  emit(_c: Case, out: string[]): void {
    out.push(this.char);
  }
}

/**
 * One character of a set: an integer index over its members. The members
 * are in the order of the default alphabet, so index 0, the target, is the
 * simplest member.
 */
export class Class implements Piece {
  /** The members, as intervals of indices of the default alphabet. */
  readonly intervals: readonly alphabet.Interval[];
  /** The number of members. */
  readonly size: number;
  readonly #bounds: IntegerBounds;

  /**
   * Returns the class of the members in intervals.
   *
   * @param intervals - The members, as merged intervals of indices.
   */
  constructor(intervals: readonly alphabet.Interval[]) {
    this.intervals = intervals;
    this.size = intervals.reduce((sum, [start, end]) => sum + end - start + 1, 0);
    this.#bounds = new IntegerBounds(0n, BigInt(this.size - 1));
  }

  /** Appends the member at the index that the case chooses. */
  emit(c: Case, out: string[]): void {
    let offset = Number(c.integer(this.#bounds));
    let [start, end] = this.intervals[0] as alphabet.Interval;
    for (let at = 1; offset > end - start; at += 1) {
      offset -= end - start + 1;
      [start, end] = this.intervals[at] as alphabet.Interval;
    }
    out.push(alphabet.character(start + offset));
  }

  /**
   * Returns the offset of a character among the members, or undefined for a
   * character that is no member.
   *
   * @param char - One code point.
   * @returns The offset.
   */
  offsetOf(char: string): number | undefined {
    const position = alphabet.indexOf(char);
    if (position === undefined) return undefined;
    let offset = 0;
    for (const [start, end] of this.intervals) {
      if (position >= start && position <= end) return offset + position - start;
      offset += end - start + 1;
    }
    return undefined;
  }
}

/** Pieces decoded one after another. */
export class Sequence implements Piece {
  /** The pieces. */
  readonly items: readonly Piece[];

  /**
   * Returns the sequence of items.
   *
   * @param items - The pieces.
   */
  constructor(items: readonly Piece[]) {
    this.items = items;
  }

  /** Decodes each piece in order. */
  emit(c: Case, out: string[]): void {
    for (const item of this.items) item.emit(c, out);
  }
}

/** Two or more branches: an index that decides structure, then the branch. */
export class Alternation implements Piece {
  /** The branches. */
  readonly branches: readonly Piece[];
  /** The bounds of the index. */
  readonly bounds: IntegerBounds;

  /**
   * Returns the alternation of branches.
   *
   * @param branches - Two or more branches.
   */
  constructor(branches: readonly Piece[]) {
    this.branches = branches;
    this.bounds = new IntegerBounds(0n, BigInt(branches.length - 1));
  }

  /** Decodes the branch that the case chooses, in a span labelled alternation. */
  emit(c: Case, out: string[]): void {
    c.span(ALTERNATION, () => {
      (this.branches[Number(c.integer(this.bounds, 0n))] as Piece).emit(c, out);
    });
  }
}

/** A quantified piece, its repetitions decoded as a collection. */
export class Repeat implements Piece {
  /** The repeated piece. */
  readonly item: Piece;
  /** The repetitions that the quantifier allows. */
  readonly sizes: Sizes;

  /**
   * Returns the repetition of item.
   *
   * @param item - The repeated piece.
   * @param sizes - The repetitions that the quantifier allows.
   */
  constructor(item: Piece, sizes: Sizes) {
    this.item = item;
    this.sizes = sizes;
  }

  /** Decodes the repetitions in a span labelled repeat. */
  emit(c: Case, out: string[]): void {
    c.span(REPEAT, () =>
      collect(c, this.sizes, ELEMENT, () => {
        this.item.emit(c, out);
        return [undefined, undefined] as const;
      }),
    );
  }
}

/** Returns the piece of a parsed node. */
function pieceOf(node: Node): Piece {
  switch (node.kind) {
    case "literal":
      return new Literal(node.char);
    case "class": {
      const intervals = alphabet.merge(
        node.ranges.flatMap(([first, last]) => alphabet.indices(first, last)),
      );
      if (intervals.length === 0) {
        throw new RangeError("prop: a class in the pattern has no member");
      }
      return new Class(intervals);
    }
    case "sequence":
      return new Sequence(node.items.map(pieceOf));
    case "alternation":
      return new Alternation(node.branches.map(pieceOf));
    default:
      return new Repeat(pieceOf(node.item), new Sizes(node.min, node.max));
  }
}

/**
 * Returns the piece of a pattern of the portable subset.
 *
 * @param text - The pattern.
 * @returns The piece.
 * @throws PatternError for a pattern outside the subset, and RangeError for
 *   a class without a member.
 */
export function piece(text: string): Piece {
  return pieceOf(parse(text).node);
}
