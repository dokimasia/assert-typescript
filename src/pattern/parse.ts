// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The portable pattern subset, parsed.
 *
 * The subset is what the regular expression engines of every target
 * language read the same way. It contains:
 *
 * - A literal: any character but the metacharacters
 *   `\ . ^ $ | ? * + ( ) [ ] { }`, or a metacharacter after a backslash.
 * - `.`: any character but the line terminators `\n`, `\r`, U+0085,
 *   U+2028 and U+2029.
 * - `\d`, `\w` and `\s`: the ASCII digits; the ASCII letters, the digits
 *   and the underscore; and space, `\t`, `\n`, `\f` and `\r`.
 * - A class `[...]` of characters, ranges and those three escapes,
 *   negated by a leading `^`. Inside a class, `\`, `[`, `]` and a hyphen
 *   that forms no range take a backslash, and a hyphen may stand first or
 *   last. A class may not contain `&&`, `--`, `||` or `~~`.
 * - A group, `(...)` or `(?:...)`, nested at most 100 deep, and
 *   alternation with `|`.
 * - The quantifiers `*`, `+`, `?`, `{m}`, `{m,}` and `{m,n}`, with counts
 *   of at most 1,000 and without a leading zero, and never two in a row.
 *   Along every chain of nested quantifiers, the counts multiply to at most
 *   1,000: each count the upper one, or the lower one when there is no
 *   upper one, and a count of 0 counted as 1.
 * - `^` as the first character of the pattern and `$` as its last.
 */

import {
  classAt,
  classOf,
  DOT,
  METACHARACTERS,
  members,
  SHORTHANDS,
} from "./classes.js";
import { Cursor } from "./cursor.js";

/** The largest count, and the largest product of the counts of nested quantifiers. RE2 refuses a larger one. */
const MAX_COUNT = 1000;

/** The deepest that groups may nest. Python's engine refuses a pattern whose groups nest 495 deep. */
const MAX_DEPTH = 100;

/** The characters that start a quantifier. */
const QUANTIFIERS = new Set("*+?{");

/** The text of one decimal digit. */
const DIGIT = /^[0-9]$/;

/** Returns the largest product of quantifier counts along a path through node. */
function weight(node: Node): number {
  switch (node.kind) {
    case "repeat":
      return Math.max(node.max ?? node.min, 1) * weight(node.item);
    case "sequence":
      return Math.max(1, ...node.items.map(weight));
    case "alternation":
      return Math.max(...node.branches.map(weight));
    default:
      return 1;
  }
}

/** A recursive-descent parser over one pattern, by code point. */
class Parser {
  readonly #cursor: Cursor;
  #depth = 0;

  constructor(text: string) {
    this.#cursor = new Cursor(text);
  }

  /** Reports whether the current character is a `$` that ends the pattern. */
  #closingAnchor(): boolean {
    const cursor = this.#cursor;
    return cursor.peek() === "$" && cursor.at === cursor.chars.length - 1;
  }

  /** Parses the whole pattern, with its optional anchors. */
  pattern(): Pattern {
    const cursor = this.#cursor;
    const start = cursor.peek() === "^";
    if (start) {
      cursor.at += 1;
    }
    const node = this.#alternation();
    const end = this.#closingAnchor();
    if (end) {
      cursor.at += 1;
    }
    if (cursor.at !== cursor.chars.length) {
      throw cursor.fail(`${JSON.stringify(cursor.peek())} is not expected`);
    }
    return { node, start, end };
  }

  /** Parses branches separated by `|`. */
  #alternation(): Node {
    const branches = [this.#sequence()];
    while (this.#cursor.peek() === "|") {
      this.#cursor.at += 1;
      branches.push(this.#sequence());
    }
    return branches.length === 1
      ? (branches[0] as Node)
      : { kind: "alternation", branches };
  }

  /**
   * Parses pieces up to a `|`, a `)`, the closing anchor or the end. A `$`
   * that ends the pattern inside a group stops the sequence, and the group
   * then fails because no `)` closes it.
   */
  #sequence(): Node {
    const items: Node[] = [];
    while (!(["", "|", ")"].includes(this.#cursor.peek()) || this.#closingAnchor())) {
      items.push(this.#quantified());
    }
    return items.length === 1 ? (items[0] as Node) : { kind: "sequence", items };
  }

  /**
   * Parses an atom and the quantifier after it, if any. A second
   * quantifier is then parsed as an atom, and refused as an unescaped
   * metacharacter.
   */
  #quantified(): Node {
    const item = this.#atom();
    if (!QUANTIFIERS.has(this.#cursor.peek())) {
      return item;
    }
    const repeat: Node = { kind: "repeat", item, ...this.#quantifier() };
    const product = weight(repeat);
    if (product > MAX_COUNT) {
      throw this.#cursor.fail(
        `nested counts multiply to ${product}, above ${MAX_COUNT}`,
      );
    }
    return repeat;
  }

  /** Parses `*`, `+`, `?`, `{m}`, `{m,}` or `{m,n}` into the repetitions it allows. */
  #quantifier(): { min: number; max: number | undefined } {
    const cursor = this.#cursor;
    const char = cursor.next("a quantifier is missing");
    if (char === "*") {
      return { min: 0, max: undefined };
    }
    if (char === "+") {
      return { min: 1, max: undefined };
    }
    if (char === "?") {
      return { min: 0, max: 1 };
    }
    const min = this.#count();
    let max: number | undefined = min;
    if (cursor.peek() === ",") {
      cursor.at += 1;
      max = cursor.peek() === "}" ? undefined : this.#count();
    }
    if (cursor.next("a count is not closed") !== "}") {
      throw cursor.fail("a count is not closed by }");
    }
    if (max !== undefined && max < min) {
      throw cursor.fail(`the count {${min},${max}} runs backwards`);
    }
    return { min, max };
  }

  /**
   * Parses the digits of a count, at most 1,000. RE2 reads a count with a
   * leading zero, such as `{007}`, as literal text, so a count of two or
   * more digits does not start with 0.
   */
  #count(): number {
    const cursor = this.#cursor;
    const start = cursor.at;
    while (DIGIT.test(cursor.peek())) {
      cursor.at += 1;
    }
    if (start === cursor.at) {
      throw cursor.fail("a count has no digits");
    }
    const digits = cursor.chars.slice(start, cursor.at).join("");
    if (digits.length > 1 && digits.startsWith("0")) {
      throw cursor.fail(`the count ${digits} has a leading zero`);
    }
    const count = Number(digits);
    if (count > MAX_COUNT) {
      throw cursor.fail(`the count ${count} is above ${MAX_COUNT}`);
    }
    return count;
  }

  /** Parses a literal, a dot, an escape, a class or a group. */
  #atom(): Node {
    const cursor = this.#cursor;
    const char = cursor.next("the pattern ends where a character belongs");
    if (char === "(") {
      return this.#group();
    }
    if (char === "[") {
      return classAt(cursor);
    }
    if (char === ".") {
      return DOT;
    }
    if (char === "\\") {
      const escaped = cursor.next("the pattern ends with a backslash");
      const shorthand = SHORTHANDS[escaped];
      if (shorthand !== undefined) {
        return classOf(members(shorthand));
      }
      if (!METACHARACTERS.has(escaped)) {
        throw cursor.fail(`\\${escaped} is not in the portable subset`);
      }
      return { kind: "literal", char: escaped };
    }
    if (METACHARACTERS.has(char)) {
      throw cursor.fail(`${JSON.stringify(char)} must be escaped here`);
    }
    return { kind: "literal", char };
  }

  /** Parses a group after its `(`, at most 100 deep. */
  #group(): Node {
    const cursor = this.#cursor;
    this.#depth += 1;
    if (this.#depth > MAX_DEPTH) {
      throw cursor.fail(`groups nest deeper than ${MAX_DEPTH}`);
    }
    if (cursor.peek() === "?") {
      if (cursor.peek(1) !== ":") {
        throw cursor.fail("only the (?: group is in the portable subset");
      }
      cursor.at += 2;
    }
    const node = this.#alternation();
    if (cursor.next("a group is not closed") !== ")") {
      throw cursor.fail("a group is not closed by )");
    }
    this.#depth -= 1;
    return node;
  }
}

/** An inclusive range of code points. */
export type Range = readonly [first: number, last: number];

/** A parsed piece of a pattern. */
export type Node =
  | { readonly kind: "literal"; readonly char: string }
  | { readonly kind: "class"; readonly ranges: readonly Range[] }
  | { readonly kind: "sequence"; readonly items: readonly Node[] }
  | { readonly kind: "alternation"; readonly branches: readonly Node[] }
  | {
      readonly kind: "repeat";
      readonly item: Node;
      readonly min: number;
      readonly max: number | undefined;
    };

/** A parsed pattern: its tree, and whether it is anchored at each end. */
export interface Pattern {
  /** The tree of the pattern between its anchors. */
  readonly node: Node;
  /** Whether the pattern starts with `^`. */
  readonly start: boolean;
  /** Whether the pattern ends with `$`. */
  readonly end: boolean;
}

/**
 * Returns the parse of a pattern of the portable subset.
 *
 * @param text - The pattern.
 * @returns Its tree and its anchors.
 * @throws PatternError for a pattern outside the subset, whose message
 *   states the position in the pattern and the construct refused there.
 */
export function parse(text: string): Pattern {
  return new Parser(text).pattern();
}
