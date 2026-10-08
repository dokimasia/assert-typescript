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

/** A pattern outside the portable subset. */
export class PatternError extends Error {
  /**
   * Returns the error of a pattern that the parser refuses.
   *
   * @param message - The pattern, the position and the construct refused there.
   */
  constructor(message: string) {
    super(message);
    this.name = "PatternError";
  }
}

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
export const LINE_TERMINATORS = String.fromCodePoint(0x0a, 0x0d, 0x85, 0x2028, 0x2029);

/** What `\d`, `\w` and `\s` read as: the members that every engine's class has. */
export const SHORTHANDS: Readonly<Record<string, string>> = {
  d: "0123456789",
  w: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
  s: " \t\n\f\r",
};

/** The largest count, and the largest product of the counts of nested quantifiers. RE2 refuses a larger one. */
const MAX_COUNT = 1000;

/** The deepest that groups may nest. Python's engine refuses a pattern whose groups nest 495 deep. */
const MAX_DEPTH = 100;

/** The characters that start a quantifier. */
const QUANTIFIERS = new Set("*+?{");

/** The highest code point. */
const LAST_CODE_POINT = 0x10ffff;

/** The surrogates, which no scalar value is. */
const SURROGATES: Range = [0xd800, 0xdfff];

/** Returns ranges sorted and merged, with adjacent ranges joined. */
function merge(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [first, last] of sorted) {
    const prior = out.at(-1);
    if (prior !== undefined && first <= prior[1] + 1) {
      prior[1] = Math.max(prior[1], last);
      continue;
    }
    out.push([first, last]);
  }
  return out;
}

/** Returns the scalar values outside ranges. */
function complement(ranges: readonly Range[]): Range[] {
  const out: Range[] = [];
  let start = 0;
  for (const [first, last] of merge([...ranges, SURROGATES])) {
    if (first > start) out.push([start, first - 1]);
    start = last + 1;
  }
  if (start <= LAST_CODE_POINT) out.push([start, LAST_CODE_POINT]);
  return out;
}

/** Returns the ranges of each character of chars. */
function members(chars: string): Range[] {
  return [...chars].map((c) => {
    const point = c.codePointAt(0) as number;
    return [point, point] as const;
  });
}

/** Returns the class of ranges. */
function classOf(ranges: readonly Range[]): Node {
  return { kind: "class", ranges: merge(ranges) };
}

/** The class that `.` reads as. */
const DOT = classOf(complement(members(LINE_TERMINATORS)));

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
  readonly #text: string;
  readonly #chars: readonly string[];
  #at = 0;
  #depth = 0;

  constructor(text: string) {
    this.#text = text;
    this.#chars = [...text];
    const lone = this.#chars.findIndex((c) => {
      const point = c.codePointAt(0) as number;
      return point >= SURROGATES[0] && point <= SURROGATES[1];
    });
    if (lone >= 0) {
      this.#at = lone;
      throw this.#fail("a lone surrogate is no character");
    }
  }

  /** Returns the error for what is wrong at the current position. */
  #fail(what: string): PatternError {
    return new PatternError(
      `pattern ${JSON.stringify(this.#text)} at ${this.#at}: ${what}`,
    );
  }

  /** Returns the character ahead of the current one, or "" past the end. */
  #peek(ahead = 0): string {
    return this.#chars[this.#at + ahead] ?? "";
  }

  /** Returns the current character and moves past it, or fails with missing at the end. */
  #next(missing: string): string {
    const char = this.#chars[this.#at];
    if (char === undefined) throw this.#fail(missing);
    this.#at += 1;
    return char;
  }

  /** Reports whether the current character is a `$` that ends the pattern. */
  #closingAnchor(): boolean {
    return this.#peek() === "$" && this.#at === this.#chars.length - 1;
  }

  /** Parses the whole pattern, with its optional anchors. */
  pattern(): Pattern {
    const start = this.#peek() === "^";
    if (start) this.#at += 1;
    const node = this.#alternation();
    const end = this.#closingAnchor();
    if (end) this.#at += 1;
    if (this.#at !== this.#chars.length) {
      throw this.#fail(`${JSON.stringify(this.#peek())} is not expected`);
    }
    return { node, start, end };
  }

  /** Parses branches separated by `|`. */
  #alternation(): Node {
    const branches = [this.#sequence()];
    while (this.#peek() === "|") {
      this.#at += 1;
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
    while (!["", "|", ")"].includes(this.#peek()) && !this.#closingAnchor()) {
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
    if (!QUANTIFIERS.has(this.#peek())) return item;
    const repeat: Node = { kind: "repeat", item, ...this.#quantifier() };
    const product = weight(repeat);
    if (product > MAX_COUNT) {
      throw this.#fail(`nested counts multiply to ${product}, above ${MAX_COUNT}`);
    }
    return repeat;
  }

  /** Parses `*`, `+`, `?`, `{m}`, `{m,}` or `{m,n}` into the repetitions it allows. */
  #quantifier(): { min: number; max: number | undefined } {
    const char = this.#next("a quantifier is missing");
    if (char === "*") return { min: 0, max: undefined };
    if (char === "+") return { min: 1, max: undefined };
    if (char === "?") return { min: 0, max: 1 };
    const min = this.#count();
    let max: number | undefined = min;
    if (this.#peek() === ",") {
      this.#at += 1;
      max = this.#peek() === "}" ? undefined : this.#count();
    }
    if (this.#next("a count is not closed") !== "}") {
      throw this.#fail("a count is not closed by }");
    }
    if (max !== undefined && max < min) {
      throw this.#fail(`the count {${min},${max}} runs backwards`);
    }
    return { min, max };
  }

  /**
   * Parses the digits of a count, at most 1,000. RE2 reads a count with a
   * leading zero, such as `{007}`, as literal text, so a count of two or
   * more digits does not start with 0.
   */
  #count(): number {
    const start = this.#at;
    while (/^[0-9]$/.test(this.#peek())) this.#at += 1;
    if (start === this.#at) throw this.#fail("a count has no digits");
    const digits = this.#chars.slice(start, this.#at).join("");
    if (digits.length > 1 && digits.startsWith("0")) {
      throw this.#fail(`the count ${digits} has a leading zero`);
    }
    const count = Number(digits);
    if (count > MAX_COUNT) throw this.#fail(`the count ${count} is above ${MAX_COUNT}`);
    return count;
  }

  /** Parses a literal, a dot, an escape, a class or a group. */
  #atom(): Node {
    const char = this.#next("the pattern ends where a character belongs");
    if (char === "(") return this.#group();
    if (char === "[") return this.#class();
    if (char === ".") return DOT;
    if (char === "\\") {
      const escaped = this.#next("the pattern ends with a backslash");
      const shorthand = SHORTHANDS[escaped];
      if (shorthand !== undefined) return classOf(members(shorthand));
      if (!METACHARACTERS.has(escaped)) {
        throw this.#fail(`\\${escaped} is not in the portable subset`);
      }
      return { kind: "literal", char: escaped };
    }
    if (METACHARACTERS.has(char)) {
      throw this.#fail(`${JSON.stringify(char)} must be escaped here`);
    }
    return { kind: "literal", char };
  }

  /** Parses a group after its `(`, at most 100 deep. */
  #group(): Node {
    this.#depth += 1;
    if (this.#depth > MAX_DEPTH)
      throw this.#fail(`groups nest deeper than ${MAX_DEPTH}`);
    if (this.#peek() === "?") {
      if (this.#peek(1) !== ":") {
        throw this.#fail("only the (?: group is in the portable subset");
      }
      this.#at += 2;
    }
    const node = this.#alternation();
    if (this.#next("a group is not closed") !== ")") {
      throw this.#fail("a group is not closed by )");
    }
    this.#depth -= 1;
    return node;
  }

  /** Parses a class after its `[`. */
  #class(): Node {
    const negated = this.#peek() === "^";
    if (negated) this.#at += 1;
    const ranges: Range[] = [];
    let previous = "";
    let first = true;
    for (
      let char = this.#next("a class is not closed");
      char !== "]";
      char = this.#next("a class is not closed")
    ) {
      previous = this.#member(char, previous, first, ranges);
      first = false;
    }
    if (first) throw this.#fail("a class is empty");
    return classOf(negated ? complement(ranges) : ranges);
  }

  /**
   * Parses the member of a class that starts with char, a shorthand, a
   * character or a range, and adds its ranges to ranges.
   *
   * @returns The character that the next member reads as the one before it,
   *   empty after a shorthand, an escape and a range.
   */
  #member(char: string, previous: string, first: boolean, ranges: Range[]): string {
    const shorthand = char === "\\" ? SHORTHANDS[this.#peek()] : undefined;
    if (shorthand !== undefined) {
      this.#at += 1;
      ranges.push(...members(shorthand));
      return "";
    }
    const low = this.#classChar(char, previous, first);
    const before = char === "\\" ? "" : char;
    if (this.#peek() !== "-" || ["", "]"].includes(this.#peek(1))) {
      ranges.push(...members(low));
      return before;
    }
    if (RESERVED_PAIRS.has(`${before}-`))
      throw this.#fail("'--' is reserved inside a class");
    this.#at += 1;
    const high = this.#classChar(this.#next("a class is not closed"), "-", false);
    const from = low.codePointAt(0) as number;
    const to = high.codePointAt(0) as number;
    if (to < from) throw this.#fail(`the range ${low}-${high} runs backwards`);
    ranges.push([from, to]);
    return "";
  }

  /**
   * Returns the character that a class member states, unescaped. It fails
   * for a `[`, a reserved pair, a misplaced hyphen, and an escape that the
   * subset does not have.
   */
  #classChar(char: string, previous: string, first: boolean): string {
    if (char === "\\") {
      const escaped = this.#next("a class ends inside an escape");
      if (!CLASS_ESCAPES.has(escaped)) {
        throw this.#fail(`\\${escaped} is not in the portable subset`);
      }
      return escaped;
    }
    if (char === "[") throw this.#fail("[ must be escaped inside a class");
    if (RESERVED_PAIRS.has(previous + char)) {
      throw this.#fail(`'${previous + char}' is reserved inside a class`);
    }
    if (char === "-" && !first && this.#peek() !== "]") {
      throw this.#fail("a hyphen inside a class must be escaped");
    }
    return char;
  }
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
