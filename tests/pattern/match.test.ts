/** The spec of the matching of text against a pattern of the portable subset. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { compile } from "../../src/pattern/match.js";
import { PatternError } from "../../src/pattern/parse.js";
import { test as it } from "../../src/vitest.js";

describe("match", () => {
  describe("compile", () => {
    const tests: {
      name: string;
      givePattern: string;
      giveText: string;
      want: boolean;
    }[] = [
      {
        name: "returns an expression that finds a match inside the text",
        givePattern: "[0-9a-f]{8}",
        giveText: "id=deadbeef",
        want: true,
      },
      {
        name: "returns an expression that reads ^ at the start of the text",
        givePattern: "^[0-9a-f]+$",
        giveText: "id=deadbeef",
        want: false,
      },
      {
        name: "returns an expression that matches the whole text of a pattern anchored at both ends",
        givePattern: "^abc$",
        giveText: "abc",
        want: true,
      },
      {
        name: "returns an expression that reads $ at the end of the text alone",
        givePattern: "^abc$",
        giveText: "abc\n",
        want: false,
      },
      {
        name: "returns an expression whose \\d leaves out the digits beyond ASCII",
        givePattern: "\\d",
        giveText: String.fromCodePoint(0x663),
        want: false,
      },
      {
        name: "returns an expression whose \\w leaves out the letters beyond ASCII",
        givePattern: "\\w",
        giveText: String.fromCodePoint(0xe9),
        want: false,
      },
      {
        name: "returns an expression whose \\s leaves out the vertical tab",
        givePattern: "\\s",
        giveText: "\u000b",
        want: false,
      },
      {
        name: "returns an expression whose \\s leaves out U+00A0",
        givePattern: "\\s",
        giveText: String.fromCodePoint(0xa0),
        want: false,
      },
      {
        name: "returns an expression whose \\s contains the form feed",
        givePattern: "\\s",
        giveText: "\f",
        want: true,
      },
      {
        name: "returns an expression whose \\s in a class contains the carriage return",
        givePattern: "[\\s]",
        giveText: "\r",
        want: true,
      },
      {
        name: "returns an expression whose dot leaves out U+0085",
        givePattern: "a.b",
        giveText: "a\u0085b",
        want: false,
      },
      {
        name: "returns an expression whose dot leaves out U+2028",
        givePattern: "a.b",
        giveText: `a${String.fromCodePoint(0x2028)}b`,
        want: false,
      },
      {
        name: "returns an expression whose dot leaves out U+2029",
        givePattern: "a.b",
        giveText: `a${String.fromCodePoint(0x2029)}b`,
        want: false,
      },
      {
        name: "returns an expression whose dot leaves out the carriage return",
        givePattern: "a.b",
        giveText: "a\rb",
        want: false,
      },
      {
        name: "returns an expression whose dot matches a character beyond the BMP",
        givePattern: "a.b",
        giveText: "a\u{1F600}b",
        want: true,
      },
      {
        name: "returns an expression whose dot matches the whole of a character beyond the BMP",
        givePattern: "^.$",
        giveText: "\u{1F600}",
        want: true,
      },
      {
        name: "returns an expression whose negated class contains the line feed",
        givePattern: "^[^a]$",
        giveText: "\n",
        want: true,
      },
      {
        name: "returns an expression whose escaped dot leaves out other characters",
        givePattern: "\\.",
        giveText: "a",
        want: false,
      },
      {
        name: "returns an expression whose escaped dot matches a dot",
        givePattern: "\\.",
        giveText: ".",
        want: true,
      },
      {
        name: "returns an expression that repeats a group of alternatives",
        givePattern: "^(?:ab|c)+$",
        giveText: "abcab",
        want: true,
      },
      {
        name: "returns an expression that reads {2} as exactly two",
        givePattern: "^x{2}$",
        giveText: "xxx",
        want: false,
      },
      {
        name: "returns an expression of the empty pattern that matches any text",
        givePattern: "",
        giveText: "anything",
        want: true,
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          compile(tt.givePattern).test(tt.giveText),
          tt.want,
          "the subset reads the pattern",
        );
      });
    }

    it("throws a PatternError for a pattern outside the subset", ({ seat }) => {
      const err = check.throws(seat, () => compile("a(?=b)"), "the pattern is refused");

      check.isTrue(seat, err instanceof PatternError, "the error is a PatternError");
    });
  });
});
