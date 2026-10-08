/**
 * Matching text against a pattern of the portable subset.
 *
 * JavaScript's engine, in its Unicode mode, reads `^` and `$` at the ends
 * of the text and `\d` and `\w` as their ASCII classes, as the subset
 * does. Its `.` matches U+0085 and its `\s` every Unicode space, so the
 * compiled expression states both as the subset's classes.
 */

import { parse } from "./parse.js";

/** The subset's `.`: any character but the five line terminators. */
const DOT = "[^\\n\\r\\u0085\\u2028\\u2029]";

/** The members of the subset's `\s`, as the inside of a class. */
const SPACE = " \\t\\n\\f\\r";

/** Returns the text of an escape of char, inside a class or outside one. */
function escapeOf(char: string, inClass: boolean): string {
  if (char !== "s") return `\\${char}`;
  return inClass ? SPACE : `[${SPACE}]`;
}

/**
 * Returns the expression that reads a pattern of the portable subset as
 * the subset does.
 *
 * @param pattern - A pattern of the portable subset.
 * @returns An expression with the flag `u`.
 * @throws PatternError for a pattern outside the subset.
 */
export function compile(pattern: string): RegExp {
  parse(pattern);

  // The subset escapes only ASCII characters, so the character after a
  // backslash is the whole escaped character. An unescaped [ opens a class
  // and an unescaped ] closes it, because neither stands for itself there.
  const chars = [...pattern];
  let source = "";
  let inClass = false;
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] as string;
    if (char === "\\") {
      i += 1;
      source += escapeOf(chars[i] as string, inClass);
      continue;
    }
    source += !inClass && char === "." ? DOT : char;
    if (char === "[" || char === "]") inClass = char === "[";
  }
  return new RegExp(source, "u");
}
