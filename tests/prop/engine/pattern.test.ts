/** The spec of the pieces of a pattern of the portable subset, decoded from a case. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { PatternError } from "../../../src/pattern/parse.js";
import { SIZE } from "../../../src/prop/engine/alphabet.js";
import { Case, DECODE, Generating, Replaying } from "../../../src/prop/engine/case.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import { Matching } from "../../../src/prop/engine/generator.js";
import {
  Alternation,
  type Class,
  Literal,
  piece,
  Repeat,
  Sequence,
} from "../../../src/prop/engine/pattern.js";
import { Source } from "../../../src/prop/engine/source.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** Seeds per pattern of the check that generated strings match. */
const SEEDS = 200;

/** Patterns that cover every construct of the subset. */
const ACCEPTED = [
  "",
  "abc",
  "^abc$",
  "^$",
  "a|b|c",
  "(foo|bar)baz",
  "(?:ab)+",
  "[a-z]+@[a-z]+\\.com",
  "\\d{3}-\\d{4}",
  "\\w+\\s\\w*",
  ".",
  ".{2,5}",
  "[^a-z]",
  "[-a]",
  "[a-]",
  "[a-z-]",
  "[\\]\\[\\\\\\-]",
  "[\\d_]x?",
  "a{0}",
  "a{2,}",
  "(a|)+",
  "x*y+z?",
  "[à-ÿ]",
  "[.$^*+?(){}|]",
  "\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$\\\\",
  "a{1000}",
];

/** Returns the string that a pattern decodes from recorded integers, and the case. */
function decode(text: string, ...values: bigint[]): [string, Case] {
  const c = new Case(
    new Replaying(values.map((value) => ({ kind: "integer", value }))),
  );
  return [new Matching(piece(text))[DECODE](c), c];
}

describe("pattern", () => {
  describe("piece", () => {
    const targets = [
      { give: "[a-z]+@[a-z]+\\.com", want: "a@a.com" },
      { give: "(foo|bar)baz", want: "foobaz" },
      { give: "x{3}", want: "xxx" },
      { give: "\\d\\w\\s", want: "00 " },
      { give: ".", want: "0" },
      { give: "[^0-9]", want: "a" },
      { give: "a?", want: "" },
      { give: "^abc$", want: "abc" },
      { give: "[A0a]", want: "0" },
      { give: "[\\d_]", want: "0" },
    ];
    for (const tt of targets) {
      it(`decodes the simplest match of ${tt.give} from no choice`, ({ seat }) => {
        check.equal(seat, decode(tt.give)[0], tt.want, "the target");
      });
    }

    for (const text of ACCEPTED) {
      it(`generates strings that ${JSON.stringify(text)} matches in full`, ({
        seat,
      }) => {
        const generator = new Matching(piece(text));
        const regexp = new RegExp(`^(?:${text})$`, "u");
        const misses = Array.from({ length: SEEDS }, (_, seed) =>
          generator[DECODE](new Case(new Generating(new Source(BigInt(seed))))),
        ).filter((value) => !regexp.test(value));

        check.isEmpty(seat, misses, "every string matches");
      });
    }

    it("throws a PatternError for a pattern outside the subset", ({ seat }) => {
      check.errorIs(
        seat,
        check.throws(seat, () => piece("a**"), "a quantifier after a quantifier"),
        PatternError,
        "the parser's refusal",
      );
    });

    it("throws a RangeError for a class without a member", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => piece("[^\u0000-\u{10ffff}]")),
        "prop: a class in the pattern has no member",
        "the refusal",
      );
    });
  });

  describe("Literal.emit", () => {
    it("appends its character without a choice", ({ seat }) => {
      const out: string[] = [];
      const c = new Case(new Replaying([]));
      new Literal("x").emit(c, out);

      check.equal(seat, [out, c.choices], [["x"], []], "the character");
    });
  });

  describe("Class.emit", () => {
    it("appends the member at the recorded index in the order of the default alphabet", ({
      seat,
    }) => {
      check.equal(
        seat,
        [0n, 1n, 2n].map((i) => decode("[A0a]", i)[0]),
        ["0", "a", "A"],
        "digits, then lowercase, then uppercase",
      );
    });

    it("skips the members of a negated class", ({ seat }) => {
      check.equal(seat, decode("[^a]", 10n)[0], "b", "a is index 10 of the alphabet");
    });

    it("chooses an index bounded by its size", ({ seat }) => {
      const [value, c] = decode("[a-c]", 2n);

      check.equal(
        seat,
        [value, c.requests[0]?.bounds.id],
        ["c", "integer 0 2"],
        "three members",
      );
    });

    it("appends a member of a later interval", ({ seat }) => {
      check.equal(seat, decode("[0x]", 1n)[0], "x", "the second interval");
    });
  });

  describe("Class.offsetOf", () => {
    const digitsAndX = piece("[0-9x]") as Class;

    const tests = [
      {
        name: "the offset of a member of the first interval",
        give: "3",
        want: 3 as number | undefined,
      },
      { name: "the offset of a member of a later interval", give: "x", want: 10 },
      {
        name: "undefined for a character that is no member",
        give: "y",
        want: undefined,
      },
      { name: "undefined for a lone surrogate", give: "\ud800", want: undefined },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, digitsAndX.offsetOf(tt.give), tt.want, "the offset");
      });
    }
  });

  describe("Class", () => {
    it("contains every character of . but the five line terminators", ({ seat }) => {
      const dot = piece(".") as Class;

      check.equal(
        seat,
        [dot.size, ["\n", "\r", "\u0085", " ", " "].map((char) => dot.offsetOf(char))],
        [SIZE - 5, [undefined, undefined, undefined, undefined, undefined]],
        "no line terminator",
      );
    });

    it("contains the ASCII members of the digit and word shorthands", ({ seat }) => {
      check.equal(
        seat,
        [(piece("\\d") as Class).size, (piece("\\w") as Class).size],
        [10, 63],
        "ten digits and 63 word characters",
      );
    });

    it("contains the five members of the space shorthand from space", ({ seat }) => {
      check.equal(
        seat,
        [0n, 1n, 2n, 3n, 4n].map((i) => decode("\\s", i)[0]),
        [" ", "\t", "\n", "\f", "\r"],
        "in alphabet order",
      );
    });
  });

  describe("Sequence.emit", () => {
    it("appends its pieces in order", ({ seat }) => {
      const out: string[] = [];
      new Sequence([new Literal("a"), new Literal("b")]).emit(
        new Case(new Replaying([])),
        out,
      );

      check.equal(seat, out, ["a", "b"], "two characters");
    });
  });

  describe("Alternation.emit", () => {
    it("appends the branch at the recorded index", ({ seat }) => {
      check.equal(seat, decode("(foo|bar)", 1n)[0], "bar", "the second branch");
    });

    it("bounds its index by its branches", ({ seat }) => {
      check.equal(
        seat,
        new Alternation([new Literal("a"), new Literal("b"), new Literal("c")]).bounds
          .id,
        "integer 0 2",
        "three branches",
      );
    });
  });

  describe("Repeat.emit", () => {
    it("appends its repetitions as a collection", ({ seat }) => {
      check.equal(
        seat,
        decode("a*", 1n, 1n, 0n)[0],
        "aa",
        "two continue flags and a stop",
      );
    });

    it("forces the flags of a fixed count", ({ seat }) => {
      check.equal(
        seat,
        decode("(ab|c){2}", 0n, 1n, 0n, 0n, 1n)[0],
        "cab",
        "two repetitions",
      );
    });

    it("decodes in spans with the edges of its flags", ({ seat }) => {
      const [, c] = decode("(a|b)[cd]*", 1n, 1n, 1n, 0n);

      check.equal(
        seat,
        [c.spans, c.requests.map((request) => request.edge)],
        [
          [
            { label: "string-matching", start: 0, end: 4, depth: 0, parent: undefined },
            { label: "alternation", start: 0, end: 1, depth: 1, parent: 0 },
            { label: "repeat", start: 1, end: 4, depth: 1, parent: 0 },
            { label: "element", start: 1, end: 3, depth: 2, parent: 2 },
          ],
          [0n, 1n, undefined, 0n],
        ],
        "the spans and the edges",
      );
    });

    it("keeps its item and its sizes", ({ seat }) => {
      const item = new Literal("a");
      const repeat = new Repeat(item, new Sizes(1, 2));

      check.equal(
        seat,
        [repeat.item === item, repeat.sizes.minSize, repeat.sizes.maxSize],
        [true, 1, 2],
        "the parts",
      );
    });
  });
});
