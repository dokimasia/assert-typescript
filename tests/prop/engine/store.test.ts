/**
 * The spec of the store: an entry's name, its format, and the verdict on
 * each file. The pinned name is the name of the definition's reference
 * implementation.
 */

import { describe } from "vitest";
import { check, prop } from "../../../src/index.js";
import type { Choice } from "../../../src/prop/engine/choice.js";
import { mix } from "../../../src/prop/engine/source.js";
import {
  entry,
  type Failure,
  MAX_DEPTH,
  name,
  read,
} from "../../../src/prop/engine/store.js";
import { encode } from "../../../src/prop/engine/token.js";
import { test as it } from "../../../src/vitest.js";

/** The contract of the property whose entries the cases read. */
const CONTRACT = "decoding undoes encoding";

/** The choices of the minimal case: the list [0, -1]. */
const CHOICES: Choice[] = [1n, 0n, 1n, -1n, 0n].map((value) => ({
  kind: "integer",
  value,
}));

/** The failure that the cases write. */
const FAILURE: Failure = {
  contract: CONTRACT,
  choices: CHOICES,
  identity: { assertion: "equal", file: "codec_test.go", line: 18 },
  counterexample: [
    { label: "values", value: { type: "list", of: "int", value: [0, -1] } },
  ],
};

/** The largest line of an identity. */
const LINE_MAX = 2 ** 31 - 1;

/** The deepest value that a draw records: the root, the counterexample and the draw take the first three levels. */
const DEEPEST_VALUE = MAX_DEPTH - 3;

/** Returns FAILURE's entry as definition 1.2.0 writes it on 1 October 2026, with changes. */
function written(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...entry(FAILURE, "1.2.0", "2026-10-01"), ...changes };
}

/** Returns the verdict on a file whose text is the JSON of document. */
function verdictOf(document: unknown): string {
  return read(JSON.stringify(document), CONTRACT).verdict;
}

/** Returns a list that nests levels arrays deep, the outer one included. */
function nested(levels: number): unknown[] {
  let node: unknown[] = [];
  for (let level = 1; level < levels; level += 1) node = [node];
  return node;
}

/** Returns the levels of objects and arrays that node nests. */
function depthOf(node: unknown): number {
  if (typeof node !== "object" || node === null) return 0;
  return 1 + Math.max(0, ...Object.values(node).map(depthOf));
}

describe("store", () => {
  describe("MAX_DEPTH", () => {
    it("nests a file at most 64 levels deep", ({ seat }) => {
      check.equal(seat, MAX_DEPTH, 64, "the levels");
    });
  });

  describe("name", () => {
    it("returns the hexadecimal mix of the contract with the token", ({ seat }) => {
      const data = Buffer.concat([
        Buffer.from(CONTRACT),
        Buffer.of(0),
        Buffer.from(encode(CHOICES)),
      ]);

      check.equal(
        seat,
        name(CONTRACT, CHOICES),
        `${mix(data).toString(16).padStart(16, "0")}.json`,
        "16 digits and .json",
      );
    });

    it("returns the pinned name of the failure", ({ seat }) => {
      check.equal(
        seat,
        name(CONTRACT, CHOICES),
        "ccc741d57d7f920d.json",
        "the name of every language",
      );
    });

    it("returns another name for another contract", ({ seat }) => {
      check.notEqual(
        seat,
        name("another", CHOICES),
        name(CONTRACT, CHOICES),
        "two properties share no entry",
      );
    });

    it("pads a small mix to 16 digits", ({ seat }) => {
      check.matches(seat, name("", []), "^[0-9a-f]{16}\\.json$", "16 lowercase digits");
    });
  });

  describe("entry", () => {
    it("states exactly the fields of the format", ({ seat }) => {
      const one = written();

      check.equal(
        seat,
        [Object.keys(one).sort(), one["store"], one["found"], one["choices"]],
        [
          [
            "choices",
            "counterexample",
            "definition",
            "found",
            "identity",
            "property",
            "store",
          ],
          1,
          "2026-10-01",
          encode(CHOICES),
        ],
        "seven fields",
      );
    });

    it("records a value at the deepest level", ({ seat }) => {
      const deep = entry(
        { ...FAILURE, counterexample: [{ label: "v", value: nested(DEEPEST_VALUE) }] },
        "1.2.0",
        "2026-10-01",
      );

      check.equal(
        seat,
        [depthOf(deep), verdictOf(deep)],
        [MAX_DEPTH, "replay"],
        "the entry nests 64 levels and replays",
      );
    });

    it("records a value past the deepest level by its label", ({ seat }) => {
      const deep = entry(
        {
          ...FAILURE,
          counterexample: [{ label: "v", value: nested(DEEPEST_VALUE + 1) }],
        },
        "1.2.0",
        "2026-10-01",
      );

      check.equal(seat, deep["counterexample"], [{ label: "v" }], "the label alone");
    });
  });

  describe("read", () => {
    it("replays the choices of an entry that a runner wrote", ({ seat }) => {
      check.equal(
        seat,
        read(JSON.stringify(written()), CONTRACT),
        { verdict: "replay", choices: CHOICES },
        "the choices",
      );
    });

    const replays = [
      { name: "an entry of another definition version", give: { definition: "1.1.0" } },
      { name: "a draw without a value", give: { counterexample: [{ label: "conn" }] } },
      {
        name: "a draw whose value is no typed literal",
        give: { counterexample: [{ label: "x", value: [1] }] },
      },
      {
        name: "an identity of a record with a location",
        give: { identity: { assertion: "equal", file: "a_test.go", line: 3 } },
      },
      {
        name: "an identity of a record without a location",
        give: { identity: { assertion: "equal", contract: "x equals y" } },
      },
      {
        name: "an identity of a message at the largest line",
        give: { identity: { file: "a_test.go", line: LINE_MAX } },
      },
      {
        name: "an identity of an error",
        give: { identity: { error: "ValueError", file: "a_test.py", line: 3 } },
      },
      { name: "an entry found on a leap day", give: { found: "2024-02-29" } },
      {
        name: "an entry found on a leap day of a fourth century",
        give: { found: "2000-02-29" },
      },
    ];
    for (const tt of replays) {
      it(`replays ${tt.name}`, ({ seat }) => {
        check.equal(seat, verdictOf(written(tt.give)), "replay", "a replay");
      });
    }

    it("returns other for an entry of another property", ({ seat }) => {
      check.equal(
        seat,
        read(JSON.stringify(written({ property: "another" })), CONTRACT),
        { verdict: "other", choices: [] },
        "another property",
      );
    });

    const skips = [
      { name: "an entry of format 2", give: '{"store": 2}' },
      {
        name: "an entry of a far later format",
        give: '{"store": 1000000000000000000000000000000}',
      },
      {
        name: "an entry whose token is of a later version",
        give: JSON.stringify(written({ choices: "prop2:AAc" })),
      },
    ];
    for (const tt of skips) {
      it(`skips ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          read(tt.give, CONTRACT),
          { verdict: "skip", choices: [] },
          "a skip",
        );
      });
    }

    const texts = [
      { name: "text that is no JSON", give: "{" },
      { name: "an object that repeats a name", give: '{"store": 1, "store": 1}' },
      { name: "NaN", give: '{"store": NaN}' },
      { name: "an array", give: "[1]" },
      { name: "a number", give: "1" },
      {
        name: "arrays nested past the parser",
        give: `${"[".repeat(100_000)}${"]".repeat(100_000)}`,
      },
    ];
    for (const tt of texts) {
      it(`returns damaged for ${tt.name}`, ({ seat }) => {
        check.equal(seat, read(tt.give, CONTRACT).verdict, "damaged", "damaged");
      });
    }

    it("returns damaged for an entry nested past the most levels", ({ seat }) => {
      const tooDeep = written({
        counterexample: [{ label: "v", value: nested(DEEPEST_VALUE + 1) }],
      });

      check.equal(
        seat,
        [depthOf(tooDeep), verdictOf(tooDeep)],
        [MAX_DEPTH + 1, "damaged"],
        "one level past the writer",
      );
    });

    const formats = [
      { name: "an absent store", give: undefined },
      { name: "a store of 0", give: 0 },
      { name: "a store that is a boolean", give: true },
      { name: "a store that is a fraction", give: 1.5 },
      { name: "a store that is a string", give: "1" },
    ];
    for (const tt of formats) {
      it(`returns damaged for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          verdictOf(written({ store: tt.give })),
          "damaged",
          "no format",
        );
      });
    }

    const changes = [
      { name: "a definition of two parts", give: { definition: "1.2" } },
      { name: "a definition with a leading zero", give: { definition: "1.02.0" } },
      { name: "a definition that is no string", give: { definition: 1 } },
      { name: "a property that is no string", give: { property: 5 } },
      {
        name: "an identity of an assertion alone",
        give: { identity: { assertion: "equal" } },
      },
      {
        name: "an identity at line 0",
        give: { identity: { file: "a_test.go", line: 0 } },
      },
      {
        name: "an identity past the largest line",
        give: { identity: { file: "a_test.go", line: LINE_MAX + 1 } },
      },
      {
        name: "an identity whose line is a boolean",
        give: { identity: { file: "a_test.go", line: true } },
      },
      {
        name: "an identity whose line is a fraction",
        give: { identity: { file: "a_test.go", line: 3.5 } },
      },
      {
        name: "an identity whose file has a slash",
        give: { identity: { file: "pkg/a_test.go", line: 3 } },
      },
      {
        name: "an identity whose file has a backslash",
        give: { identity: { file: "pkg\\a_test.go", line: 3 } },
      },
      {
        name: "an identity whose file is empty",
        give: { identity: { file: "", line: 3 } },
      },
      {
        name: "an identity whose assertion is no string",
        give: { identity: { assertion: 1, contract: "x" } },
      },
      { name: "an identity that is no object", give: { identity: "equal" } },
      { name: "choices that are no string", give: { choices: 5 } },
      { name: "choices without a version", give: { choices: "AAc" } },
      {
        name: "choices with a version of a leading zero",
        give: { choices: "prop01:AAc" },
      },
      { name: "choices with padding", give: { choices: "prop1:AAc=" } },
      {
        name: "a counterexample that is no list",
        give: { counterexample: { label: "x" } },
      },
      {
        name: "a draw without a label",
        give: { counterexample: [{ value: { type: "int", value: 1 } }] },
      },
      {
        name: "a draw with another field",
        give: { counterexample: [{ label: "x", note: "y" }] },
      },
      {
        name: "a draw whose label is no string",
        give: { counterexample: [{ label: 5 }] },
      },
      { name: "a draw that is no object", give: { counterexample: ["x"] } },
      { name: "a date that does not exist", give: { found: "2026-02-30" } },
      {
        name: "a date of a century that is no leap year",
        give: { found: "1900-02-29" },
      },
      { name: "a date of month 13", give: { found: "2026-13-01" } },
      { name: "a date of month 0", give: { found: "2026-00-01" } },
      { name: "a date of day 0", give: { found: "2026-10-00" } },
      { name: "a date of year 0", give: { found: "0000-10-01" } },
      { name: "a date in words", give: { found: "1 October 2026" } },
      { name: "a date that is a number", give: { found: 20_261_001 } },
    ];
    for (const tt of changes) {
      it(`returns damaged for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          verdictOf(written(tt.give)),
          "damaged",
          "a field out of its form",
        );
      });
    }

    it("returns damaged for an entry without a field of the format", ({ seat }) => {
      const missing = written();
      delete missing["found"];

      check.equal(seat, verdictOf(missing), "damaged", "no date");
    });

    it("returns damaged for an entry with a field outside the format", ({ seat }) => {
      check.equal(
        seat,
        verdictOf(written({ comment: "found in review" })),
        "damaged",
        "a comment",
      );
    });

    it("returns a verdict for any text", async ({ seat }) => {
      await prop.fuzz(seat, "read returns a verdict for any text", (c) => {
        const text = Buffer.from(c.draw(prop.bytes(), "text")).toString("utf8");

        check.contains(
          c,
          ["replay", "other", "skip", "damaged"],
          read(text, CONTRACT).verdict,
          "one of the four verdicts",
        );
      });
    });
  });
});
