/**
 * The spec of the parser of the portable pattern subset.
 *
 * Each entry of testdata/verdicts.json is the verdict of the definition's
 * reference parser on the entry's pattern, with the position at which it
 * refuses the pattern. The parser returns the same verdict at the same
 * position.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { check, prop } from "../../src/index.js";
import { type Node, PatternError, parse } from "../../src/pattern/parse.js";
import { test as it } from "../../src/vitest.js";

/** One pattern, and the verdict of the reference parser on it. */
interface Verdict {
  readonly pattern: string;
  readonly accepted: boolean;
  readonly at?: number | null;
}

const VERDICTS = JSON.parse(
  readFileSync(join(import.meta.dirname, "testdata", "verdicts.json"), "utf8"),
) as Verdict[];

/** Returns what parse throws for text, or undefined when it returns. */
function refusal(text: string): unknown {
  try {
    parse(text);
  } catch (err) {
    return err;
  }
  return undefined;
}

/** Returns the literal node of char. */
function literal(char: string): Node {
  return { kind: "literal", char };
}

describe("parse", () => {
  describe("parse", () => {
    it("checks verdicts of acceptance with verdicts of refusal", ({ seat }) => {
      check.isTrue(
        seat,
        VERDICTS.some((v) => v.accepted),
        "a verdict accepts",
      );
      check.isTrue(
        seat,
        VERDICTS.some((v) => !v.accepted),
        "a verdict refuses",
      );
    });

    const tests = VERDICTS.map((v) => ({
      name: `${v.accepted ? "accepts" : "refuses"} ${JSON.stringify(v.pattern).slice(0, 60)}`,
      give: v.pattern,
      wantAccepted: v.accepted,
      wantAt: typeof v.at === "number" ? ` at ${v.at}: ` : "",
    }));

    for (const tt of tests.filter((t) => t.wantAccepted)) {
      it(tt.name, ({ seat }) => {
        check.doesNotThrow(
          seat,
          () => parse(tt.give),
          "the subset contains the pattern",
        );
      });
    }

    for (const tt of tests.filter((t) => !t.wantAccepted)) {
      it(tt.name, ({ seat }) => {
        const err = refusal(tt.give);

        check.isTrue(
          seat,
          err instanceof PatternError,
          "the parser refuses the pattern",
        );
        check.contains(seat, String((err as Error).message), tt.wantAt, "the position");
      });
    }

    it("states the pattern with the position of the construct that it refuses", ({
      seat,
    }) => {
      check.equal(
        seat,
        String((refusal("(a)\\1") as Error).message),
        'pattern "(a)\\\\1" at 5: \\1 is not in the portable subset',
        "the refusal",
      );
    });

    it("returns the tree of a pattern with its anchors", ({ seat }) => {
      check.equal(
        seat,
        parse("^a(?:b|c)*d{2,3}$"),
        {
          node: {
            kind: "sequence",
            items: [
              literal("a"),
              {
                kind: "repeat",
                item: { kind: "alternation", branches: [literal("b"), literal("c")] },
                min: 0,
                max: undefined,
              },
              { kind: "repeat", item: literal("d"), min: 2, max: 3 },
            ],
          },
          start: true,
          end: true,
        },
        "the tree",
      );
    });

    it("returns a class as the merged ranges of its code points", ({ seat }) => {
      check.equal(
        seat,
        parse("[a-cb-e\\d]").node,
        {
          kind: "class",
          ranges: [
            [0x30, 0x39],
            [0x61, 0x65],
          ],
        },
        "the ranges",
      );
    });

    it("returns a negated class as the ranges of every other scalar value", ({
      seat,
    }) => {
      check.equal(
        seat,
        parse("[^b-y]").node,
        {
          kind: "class",
          ranges: [
            [0, 0x61],
            [0x7a, 0xd7ff],
            [0xe000, 0x10ffff],
          ],
        },
        "the ranges outside b to y",
      );
    });

    it("returns a negated class of a range that starts at NUL", ({ seat }) => {
      check.equal(
        seat,
        parse(`[^${String.fromCodePoint(0)}-a]`).node,
        {
          kind: "class",
          ranges: [
            [0x62, 0xd7ff],
            [0xe000, 0x10ffff],
          ],
        },
        "the ranges above a",
      );
    });

    it("returns a negated class of a member that is the last code point", ({
      seat,
    }) => {
      check.equal(
        seat,
        parse(`[^a${String.fromCodePoint(0x10ffff)}]`).node,
        {
          kind: "class",
          ranges: [
            [0, 0x60],
            [0x62, 0xd7ff],
            [0xe000, 0x10fffe],
          ],
        },
        "the ranges without a and U+10FFFF",
      );
    });

    it("throws nothing but a PatternError for any text", async ({ seat }) => {
      await prop.fuzz(seat, "parse throws nothing but a PatternError", (c) => {
        const text = c.draw(prop.string(), "pattern");
        try {
          parse(text);
        } catch (err) {
          check.errorIs(c, err, PatternError, "the refusal is a PatternError");
        }
      });
    });
  });

  describe("new PatternError", () => {
    it("returns an error named PatternError with the message", ({ seat }) => {
      const err = new PatternError('pattern "x" at 0: a reason');

      check.equal(
        seat,
        [err.name, err.message],
        ["PatternError", 'pattern "x" at 0: a reason'],
        "the error",
      );
    });
  });
});
