/** The spec of the generators of the property vectors, stated as data. */

import { describe } from "vitest";
import { build, SpecError } from "../../../src/conformance/prop/generator.js";
import { check } from "../../../src/index.js";
import { Case, DECODE, Replaying } from "../../../src/prop/engine/case.js";
import type { Choice, Value } from "../../../src/prop/engine/choice.js";
import {
  Bool,
  Bytes,
  Dict,
  Filter,
  Float,
  Integer,
  Just,
  List,
  Mapped,
  Matching,
  OneOf,
  Optional,
  Permutation,
  Recursive,
  SampledFrom,
  Text,
} from "../../../src/prop/engine/generator.js";
import { canonical, Pairs } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

const DIGIT = { gen: "integer", min: 0, max: 9 };
const TREE = {
  gen: "recursive",
  base: DIGIT,
  extend: { gen: "list", of: { gen: "self" }, max_size: 3 },
};

/** Returns a recorded choice of the kind that the type of value implies. */
function choiceOf(value: Value): Choice {
  if (typeof value === "bigint") return { kind: "integer", value };
  if (typeof value === "number") return { kind: "float", value };
  return { kind: "sequence", value };
}

/** Returns the value that a spec's generator decodes from recorded values. */
function decoded(spec: unknown, ...values: Value[]): unknown {
  return build(spec)[DECODE](new Case(new Replaying(values.map(choiceOf))));
}

describe("generator", () => {
  describe("new SpecError", () => {
    it("returns the error of a spec", ({ seat }) => {
      const err = new SpecError("prop: 1 is no generator spec");

      check.equal(
        seat,
        [err.name, err.message],
        ["SpecError", "prop: 1 is no generator spec"],
        "the name and the message",
      );
    });
  });

  describe("build", () => {
    const tests: {
      name: string;
      give: unknown;
      want: [abstract new (...args: never) => unknown, unknown];
    }[] = [
      { name: "an integer", give: DIGIT, want: [Integer, 0n] },
      {
        name: "a duration",
        give: { gen: "duration", min: -5, max: 5 },
        want: [Integer, 0n],
      },
      {
        name: "a float of width 64 by default",
        give: { gen: "float", min: "-Inf", max: "Inf" },
        want: [Float, 0],
      },
      { name: "a boolean", give: { gen: "boolean", p: [2, 6] }, want: [Bool, false] },
      {
        name: "a just",
        give: { gen: "just", value: { type: "string", value: "x" } },
        want: [Just, "x"],
      },
      {
        name: "a sampled-from",
        give: { gen: "sampled-from", values: [{ type: "int", value: 4 }] },
        want: [SampledFrom, 4n],
      },
      {
        name: "a string over the default alphabet",
        give: { gen: "string", min_size: 1 },
        want: [Text, "0"],
      },
      {
        name: "a string over a stated alphabet",
        give: { gen: "string", alphabet: "xyz", min_size: 2, max_size: null },
        want: [Text, "xx"],
      },
      {
        name: "a string matching a pattern",
        give: { gen: "string-matching", pattern: "a+" },
        want: [Matching, "a"],
      },
      {
        name: "bytes",
        give: { gen: "bytes", max_size: 2 },
        want: [Bytes, Uint8Array.of()],
      },
      {
        name: "a permutation",
        give: {
          gen: "permutation",
          values: [
            { type: "int", value: 1 },
            { type: "int", value: 2 },
          ],
        },
        want: [Permutation, [1n, 2n]],
      },
      { name: "a recursive value", give: TREE, want: [Recursive, 0n] },
      {
        name: "a one-of",
        give: { gen: "one-of", of: [DIGIT, DIGIT] },
        want: [OneOf, 0n],
      },
      {
        name: "an optional",
        give: { gen: "optional", of: DIGIT },
        want: [Optional, undefined],
      },
      {
        name: "a list",
        give: { gen: "list", of: DIGIT, unique: true },
        want: [List, []],
      },
      {
        name: "a dict",
        give: { gen: "dict", keys: DIGIT, values: DIGIT },
        want: [Dict, new Pairs([])],
      },
      {
        name: "a filter",
        give: { gen: "filter", of: DIGIT, keep: { kind: "always" } },
        want: [Filter, 0n],
      },
      {
        name: "a map",
        give: { gen: "map", of: DIGIT, subject: "wraps-in-a-and-b" },
        want: [Mapped, "a0b"],
      },
    ];
    for (const tt of tests) {
      it(`builds ${tt.name}`, ({ seat }) => {
        const [type, value] = tt.want;

        check.equal(
          seat,
          [build(tt.give) instanceof type, canonical(decoded(tt.give))],
          [true, canonical(value)],
          "the generator and its target",
        );
      });
    }

    it("builds a boolean of p in lowest terms", ({ seat }) => {
      check.equal(
        seat,
        (build({ gen: "boolean", p: [2, 6] }) as Bool).p,
        { num: 1n, den: 3n },
        "1 in 3",
      );
    });

    it("builds a boolean of one half without p", ({ seat }) => {
      check.equal(
        seat,
        (build({ gen: "boolean", p: null }) as Bool).p,
        { num: 1n, den: 2n },
        "1 in 2",
      );
    });

    it("builds a float of a stated width that allows NaN", ({ seat }) => {
      const bounds = (
        build({ gen: "float", min: 0, max: 1, width: 32, allow_nan: true }) as Float
      ).bounds;

      check.equal(
        seat,
        [bounds.width, bounds.allowNan],
        [32, true],
        "width 32 with NaN",
      );
    });

    it("binds each self of an extension to its recursive generator", ({ seat }) => {
      check.equal(seat, decoded(TREE, 1n, 1n, 0n, 5n, 0n), [5n], "a list of one leaf");
    });

    it("binds a nested self to the innermost recursive generator", ({ seat }) => {
      const inner = { ...TREE, max_leaves: 1 };
      const outer = { gen: "recursive", base: inner, extend: TREE.extend };

      check.equal(
        seat,
        decoded(outer, 0n, 1n, 1n, 0n, 5n, 1n, 1n, 7n, 0n),
        [5n, 7n],
        "the inner tree's limit",
      );
    });

    const refusals = [
      {
        name: "a spec that is no object",
        give: [DIGIT] as unknown,
        want: `prop: ${JSON.stringify([DIGIT])} is no generator spec`,
      },
      { name: "null", give: null, want: "prop: null is no generator spec" },
      {
        name: "a spec without an id",
        give: { min: 0 },
        want: "prop: undefined is no generator",
      },
      {
        name: "an id that names no generator",
        give: { gen: "integers" },
        want: 'prop: "integers" is no generator',
      },
      {
        name: "an id that is no string",
        give: { gen: 1 },
        want: "prop: 1 is no generator",
      },
      {
        name: "a self outside an extension",
        give: { gen: "self" },
        want: "prop: self appears outside the extension of a recursive generator",
      },
      {
        name: "a self in a recursive base",
        give: { ...TREE, base: { gen: "list", of: { gen: "self" } } },
        want: "prop: self appears outside the extension of a recursive generator",
      },
      {
        name: "a missing parameter",
        give: { gen: "integer", max: 9 },
        want: 'prop: "integer" needs min',
      },
      {
        name: "a boolean parameter that is no boolean",
        give: { gen: "list", of: DIGIT, unique: "yes" },
        want: 'prop: unique is "yes", not a boolean',
      },
      {
        name: "a p of one number",
        give: { gen: "boolean", p: [1] },
        want: "prop: p is [1], want [numerator, denominator]",
      },
      {
        name: "a p above one",
        give: { gen: "boolean", p: [2, 1] },
        want: "prop: p is [2,1], want [numerator, denominator]",
      },
      {
        name: "a negative p",
        give: { gen: "boolean", p: [-1, 2] },
        want: "prop: p is [-1,2], want [numerator, denominator]",
      },
      {
        name: "a p over zero",
        give: { gen: "boolean", p: [0, 0] },
        want: "prop: p is [0,0], want [numerator, denominator]",
      },
      {
        name: "a p that is text",
        give: { gen: "boolean", p: "1/2" },
        want: 'prop: p is "1/2", want [numerator, denominator]',
      },
      {
        name: "a p of a fraction",
        give: { gen: "boolean", p: [0.5, 1] },
        want: "prop: p is [0.5,1], want [numerator, denominator]",
      },
      {
        name: "values that are no list",
        give: { gen: "sampled-from", values: { type: "int", value: 1 } },
        want: 'prop: values is {"type":"int","value":1}, not a list',
      },
      {
        name: "a sampled-from without values",
        give: { gen: "sampled-from", values: [] },
        want: "prop: sampled-from needs at least one value",
      },
      {
        name: "a one-of without alternatives",
        give: { gen: "one-of", of: [] },
        want: "prop: one-of needs a list of generators, not []",
      },
      {
        name: "a one-of of one spec",
        give: { gen: "one-of", of: DIGIT },
        want: `prop: one-of needs a list of generators, not ${JSON.stringify(DIGIT)}`,
      },
      {
        name: "an empty alphabet",
        give: { gen: "string", alphabet: "" },
        want: 'prop: alphabet is "", not a non-empty string',
      },
      {
        name: "an alphabet that is no string",
        give: { gen: "string", alphabet: 5 },
        want: "prop: alphabet is 5, not a non-empty string",
      },
      {
        name: "an alphabet that repeats a character",
        give: { gen: "string", alphabet: "xx" },
        want: 'prop: alphabet "xx" repeats a character',
      },
      {
        name: "an alphabet with a lone surrogate",
        give: { gen: "string", alphabet: "\ud800" },
        want: 'prop: alphabet "\\ud800" has a lone surrogate',
      },
      {
        name: "a pattern that is no string",
        give: { gen: "string-matching", pattern: 5 },
        want: "prop: pattern is 5, not a string",
      },
      {
        name: "a max_leaves below 1",
        give: { ...TREE, max_leaves: 0 },
        want: "prop: max_leaves is 0, below 1",
      },
      {
        name: "a map of a subject without a function",
        give: { gen: "map", of: DIGIT, subject: "ascending" },
        want: 'prop: the subject "ascending" has no function',
      },
      {
        name: "a map of a subject that is no string",
        give: { gen: "map", of: DIGIT, subject: 1 },
        want: "prop: the subject 1 has no function",
      },
    ];
    for (const tt of refusals) {
      it(`throws for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => build(tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });
});
