// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The classes of the portable pattern subset: the ranges of code points of
 * a class `[...]`, of `.` and of the escapes `\d`, `\w` and `\s`.
 */

import { type Cursor, SURROGATES } from "./cursor.js";
import type { Node, Range } from "./parse.js";

/** The characters that are literal only after a backslash. */
const METACHARACTERS = new Set("\\.^$|?*+()[]{}");

/** The characters that a backslash makes literal inside a class. */
const CLASS_ESCAPES = new Set([...METACHARACTERS, "-"]);

/** Pairs that a class may not contain: Java reads `&&` as an intersection, and other engines reserve the rest. */
const RESERVED_PAIRS = new Set(["&&", "--", "||", "~~"]);

/**
 * The characters that `.` leaves out, because some engine's `.` does not
 * match them: `\n`, `\r`, U+0085, U+2028 and U+2029.
 */
const LINE_TERMINATORS = "\n\r\u0085\u2028\u2029";

/** The highest code point. */
const LAST_CODE_POINT = 0x10_ff_ff;

/** Returns ranges sorted and merged, with adjacent ranges joined. */
function merge(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [first, last] of sorted) {
    const prior = out.at(-1);
    if (prior !== undefined && first <= prior[1] + 1) {
      prior[1] = Math.max(prior[1], last);
    } else {
      out.push([first, last]);
    }
  }
  return out;
}

/** Returns the scalar values outside ranges. */
function complement(ranges: readonly Range[]): Range[] {
  const out: Range[] = [];
  let start = 0;
  for (const [first, last] of merge([...ranges, SURROGATES])) {
    if (first > start) {
      out.push([start, first - 1]);
    }
    start = last + 1;
  }
  if (start <= LAST_CODE_POINT) {
    out.push([start, LAST_CODE_POINT]);
  }
  return out;
}

/**
 * Returns the character that a class member states, unescaped. It fails
 * for a `[`, a reserved pair, a misplaced hyphen, and an escape that the
 * subset does not have.
 */
function classChar(
  cursor: Cursor,
  char: string,
  previous: string,
  first: boolean,
): string {
  if (char === "\\") {
    const escaped = cursor.next("a class ends inside an escape");
    if (!CLASS_ESCAPES.has(escaped)) {
      throw cursor.fail(`\\${escaped} is not in the portable subset`);
    }
    return escaped;
  }
  if (char === "[") {
    throw cursor.fail("[ must be escaped inside a class");
  }
  if (RESERVED_PAIRS.has(previous + char)) {
    throw cursor.fail(`'${previous + char}' is reserved inside a class`);
  }
  if (char === "-" && !first && cursor.peek() !== "]") {
    throw cursor.fail("a hyphen inside a class must be escaped");
  }
  return char;
}

/**
 * Parses the member of a class that starts with char, a shorthand, a
 * character or a range, and adds its ranges to ranges.
 *
 * @returns The character that the next member reads as the one before it,
 *   empty after a shorthand, an escape and a range.
 */
function member(
  cursor: Cursor,
  char: string,
  previous: string,
  first: boolean,
  ranges: Range[],
): string {
  const shorthand = char === "\\" ? SHORTHANDS[cursor.peek()] : undefined;
  if (shorthand !== undefined) {
    cursor.at += 1;
    ranges.push(...members(shorthand));
    return "";
  }
  const low = classChar(cursor, char, previous, first);
  const before = char === "\\" ? "" : char;
  if (cursor.peek() !== "-" || ["", "]"].includes(cursor.peek(1))) {
    ranges.push(...members(low));
    return before;
  }
  if (RESERVED_PAIRS.has(`${before}-`)) {
    throw cursor.fail("'--' is reserved inside a class");
  }
  cursor.at += 1;
  const high = classChar(cursor, cursor.next("a class is not closed"), "-", false);
  const from = low.codePointAt(0) as number;
  const to = high.codePointAt(0) as number;
  if (to < from) {
    throw cursor.fail(`the range ${low}-${high} runs backwards`);
  }
  ranges.push([from, to]);
  return "";
}

export { METACHARACTERS };

/** What `\d`, `\w` and `\s` read as: the members that every engine's class has. */
export const SHORTHANDS: Readonly<Record<string, string>> = {
  d: "0123456789",
  w: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
  s: " \t\n\f\r",
};

/**
 * Returns the ranges of each character of chars.
 *
 * @param chars - The characters.
 * @returns One range of one code point for each character.
 */
export function members(chars: string): Range[] {
  return [...chars].map((c) => {
    const point = c.codePointAt(0) as number;
    return [point, point] as const;
  });
}

/**
 * Returns the class of ranges, sorted and merged.
 *
 * @param ranges - The ranges.
 * @returns The class.
 */
export function classOf(ranges: readonly Range[]): Node {
  return { kind: "class", ranges: merge(ranges) };
}

/** The class that `.` reads as. */
export const DOT = classOf(complement(members(LINE_TERMINATORS)));

/**
 * Parses a class after its `[`.
 *
 * @param cursor - The cursor after the `[`.
 * @returns The class.
 * @throws PatternError for a class outside the subset.
 */
export function classAt(cursor: Cursor): Node {
  const negated = cursor.peek() === "^";
  if (negated) {
    cursor.at += 1;
  }
  const ranges: Range[] = [];
  let previous = "";
  let first = true;
  for (
    let char = cursor.next("a class is not closed");
    char !== "]";
    char = cursor.next("a class is not closed")
  ) {
    previous = member(cursor, char, previous, first, ranges);
    first = false;
  }
  if (first) {
    throw cursor.fail("a class is empty");
  }
  return classOf(negated ? complement(ranges) : ranges);
}
