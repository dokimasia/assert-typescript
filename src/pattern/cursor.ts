// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The position of a parse in a pattern, by code point, and the error of a
 * pattern outside the portable subset.
 */

/** The first and the last surrogate. */
const FIRST_SURROGATE = 0xd8_00;
const LAST_SURROGATE = 0xdf_ff;

/** The surrogates, which no scalar value is. */
export const SURROGATES = [FIRST_SURROGATE, LAST_SURROGATE] as const;

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

/** The code points of one pattern and the position of its parse. */
export class Cursor {
  readonly #text: string;
  /** The code points of the pattern. */
  readonly chars: readonly string[];
  /** The position of the current code point. */
  at = 0;

  /**
   * Returns the cursor at the start of text.
   *
   * @param text - The pattern.
   * @throws PatternError for a pattern with a lone surrogate.
   */
  constructor(text: string) {
    this.#text = text;
    this.chars = [...text];
    const lone = this.chars.findIndex((c) => {
      const point = c.codePointAt(0) as number;
      return point >= SURROGATES[0] && point <= SURROGATES[1];
    });
    if (lone >= 0) {
      this.at = lone;
      throw this.fail("a lone surrogate is no character");
    }
  }

  /**
   * Returns the error for what is wrong at the current position.
   *
   * @param what - What is wrong.
   * @returns The error.
   */
  fail(what: string): PatternError {
    return new PatternError(
      `pattern ${JSON.stringify(this.#text)} at ${this.at}: ${what}`,
    );
  }

  /**
   * Returns the character ahead of the current one, or "" past the end.
   *
   * @param ahead - How many characters past the current one.
   * @returns The character.
   */
  peek(ahead = 0): string {
    return this.chars[this.at + ahead] ?? "";
  }

  /**
   * Returns the current character and moves past it.
   *
   * @param missing - What is missing when the pattern ends here.
   * @returns The character.
   * @throws PatternError with missing at the end of the pattern.
   */
  next(missing: string): string {
    const char = this.chars[this.at];
    if (char === undefined) {
      throw this.fail(missing);
    }
    this.at += 1;
    return char;
  }
}
