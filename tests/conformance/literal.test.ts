/**
 * The spec of the decoding of a corpus case's typed literals, and of the
 * comparison of a reported value with one that a case states.
 *
 * A literal that the decoder cannot read stops the run, because a case
 * that became an empty one would pass having tested nothing.
 */

import { describe } from "vitest";
import {
  canonical,
  decode,
  type Literal,
  Objects,
  sameJson,
} from "../../src/conformance/literal.js";
import { byIdentity, check, equateNans, files } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Returns the message of what decode throws for literal, or the empty string. */
function refusal(literal: Literal): string {
  try {
    decode(literal);
  } catch (err) {
    return (err as Error).message;
  }
  return "";
}

describe("literal", () => {
  describe("decode", () => {
    const tests: { name: string; give: Literal; want: unknown }[] = [
      { name: "returns null for null", give: { type: "null" }, want: null },
      {
        name: "returns the boolean of a bool",
        give: { type: "bool", value: true },
        want: true,
      },
      {
        name: "returns the number of an int",
        give: { type: "int", value: 42 },
        want: 42,
      },
      {
        name: "returns the number of a float",
        give: { type: "float", value: 1.5 },
        want: 1.5,
      },
      {
        name: "returns the string of a string",
        give: { type: "string", value: "hi" },
        want: "hi",
      },
      {
        name: "returns NaN for the float NaN",
        give: { type: "float", value: "NaN" },
        want: Number.NaN,
      },
      {
        name: "returns infinity for the float Inf",
        give: { type: "float", value: "Inf" },
        want: Number.POSITIVE_INFINITY,
      },
      {
        name: "returns negative infinity for the float -Inf",
        give: { type: "float", value: "-Inf" },
        want: Number.NEGATIVE_INFINITY,
      },
      {
        name: "returns an array for a list of scalars",
        give: { type: "list", of: "int", value: [1, 2] },
        want: [1, 2],
      },
      {
        name: "returns null for a list whose value is null",
        give: { type: "list", of: "int", value: null },
        want: null,
      },
      {
        name: "returns a Map for a map of scalars",
        give: { type: "map", key: "string", of: "int", value: { a: 1 } },
        want: new Map([["a", 1]]),
      },
      {
        name: "returns null for a map whose value is null",
        give: { type: "map", key: "string", of: "int", value: null },
        want: null,
      },
      {
        name: "returns the number of an int that a decimal string states",
        give: { type: "int", value: "42" },
        want: 42,
      },
      {
        name: "returns a bigint for an int beyond the safe range",
        give: { type: "int", value: "18446744073709551615" },
        want: 18446744073709551615n,
      },
      {
        name: "returns the bytes of lowercase hexadecimal text",
        give: { type: "bytes", value: "00ff10" },
        want: Uint8Array.of(0, 255, 16),
      },
      {
        name: "returns no byte for the empty text",
        give: { type: "bytes", value: "" },
        want: new Uint8Array(),
      },
      {
        name: "returns an array of the values of a list of booleans",
        give: { type: "list", of: "bool", value: [true] },
        want: [true],
      },
      {
        name: "returns an array of the values of a list of strings",
        give: { type: "list", of: "string", value: ["a"] },
        want: ["a"],
      },
      {
        name: "returns an array of the values of a list of floats",
        give: { type: "list", of: "float", value: [1.5, "Inf"] },
        want: [1.5, Number.POSITIVE_INFINITY],
      },
      {
        name: "returns an array of the decoded items of a list of items",
        give: {
          type: "list",
          items: [
            { type: "int", value: 1 },
            { type: "string", value: "a" },
          ],
        },
        want: [1, "a"],
      },
      {
        name: "returns a Map of the decoded entries of a map of entries",
        give: {
          type: "map",
          entries: [
            [
              { type: "int", value: 1 },
              { type: "string", value: "a" },
            ],
          ],
        },
        want: new Map([[1, "a"]]),
      },
      {
        name: "returns an object of the decoded fields of a record",
        give: { type: "record", fields: [["a", { type: "int", value: 1 }]] },
        want: { a: 1 },
      },
      {
        name: "returns the tree of a tree literal",
        give: { type: "tree", entries: [{ path: "a.txt", text: "a" }] },
        want: { "a.txt": files.text("a") },
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, decode(tt.give), tt.want, "the decoded value", equateNans());
      });
    }
  });

  describe("decode", () => {
    const tests: { name: string; give: Literal; want: string }[] = [
      {
        name: "throws for a float name that the encoding does not define",
        give: { type: "float", value: "huge" },
        want: "unknown float",
      },
      {
        name: "throws for a type that the encoding does not define",
        give: { type: "decimal", value: 1 },
        want: "unknown literal type",
      },
      {
        name: "throws for a list without an element type",
        give: { type: "list", value: [] },
        want: "states no of",
      },
      {
        name: "throws for a list whose element type is no scalar",
        give: { type: "list", of: "list", value: [] },
        want: "which is not a scalar",
      },
      {
        name: "throws for a list whose value is no array",
        give: { type: "list", of: "int", value: 1 },
        want: "not an array",
      },
      {
        name: "throws for a map without a key type",
        give: { type: "map", of: "int", value: {} },
        want: "states no key",
      },
      {
        name: "throws for a map whose value is no object",
        give: { type: "map", key: "string", of: "int", value: [1] },
        want: "not an object",
      },
      {
        name: "throws for a map whose key type is no scalar",
        give: { type: "map", key: "list", of: "int", value: {} },
        want: "a map names key list, which is not a scalar",
      },
      {
        name: "throws for an int beyond the safe range that a number states",
        give: { type: "int", value: 2 ** 53 },
        want: "an int states 9007199254740992, no safe integer",
      },
      {
        name: "throws for an int that states neither a number nor a decimal string",
        give: { type: "int", value: true },
        want: "an int states true",
      },
      {
        name: "throws for a float that states neither a number nor a name",
        give: { type: "float", value: true },
        want: "a float states true",
      },
      {
        name: "throws for a bool that states no boolean",
        give: { type: "bool", value: 1 },
        want: "a bool states 1",
      },
      {
        name: "throws for a string that states no string",
        give: { type: "string", value: 1 },
        want: "a string states 1",
      },
      {
        name: "throws for bytes that state no lowercase hexadecimal",
        give: { type: "bytes", value: "0G" },
        want: 'bytes state "0G", no lowercase hexadecimal',
      },
      {
        name: "throws for a list whose items are no array",
        give: { type: "list", items: 1 },
        want: "a list states items that are not an array",
      },
      {
        name: "throws for a map whose entries are no array",
        give: { type: "map", entries: 1 },
        want: "a map states entries that are not an array",
      },
      {
        name: "throws for a record whose fields are no array",
        give: { type: "record", fields: 1 },
        want: "a record states fields that are not an array",
      },
      {
        name: "throws for a reference without an id",
        give: { type: "reference", value: { type: "int", value: 1 } },
        want: "a reference states no id",
      },
      {
        name: "throws the fault of a tree literal that misstates an entry",
        give: { type: "tree", entries: [{ path: "a" }] },
        want: "entries[0]: the entry states []",
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.contains(
          seat,
          refusal(tt.give),
          tt.want,
          "the decoder refuses the literal",
        );
      });
    }
  });

  describe("Objects.decode", () => {
    it("returns one object for each reference of one id", ({ seat }) => {
      const objects = new Objects();
      const literal: Literal = {
        type: "reference",
        id: "a",
        value: { type: "list", of: "int", value: [1] },
      };

      const first = objects.decode(literal);

      check.equal(
        seat,
        objects.decode(literal),
        first,
        "the second reference is the first object",
        byIdentity(),
      );
    });

    it("returns a boxed primitive for a reference whose value is no object", ({
      seat,
    }) => {
      const boxed = new Objects().decode({
        type: "reference",
        id: "a",
        value: { type: "int", value: 1 },
      });

      check.isTrue(seat, boxed instanceof Number, "the reference is an object of 1");
    });
  });

  describe("canonical", () => {
    const tests: { name: string; give: [unknown, unknown]; want: boolean }[] = [
      {
        name: "returns the same text for an int as for a float of its value",
        give: [1, 1.0],
        want: true,
      },
      {
        name: "returns the same text for a bigint as for a number of its value",
        give: [7, 7n],
        want: true,
      },
      { name: "returns another text for -0 than for 0", give: [-0, 0], want: false },
      {
        name: "returns one text for two NaNs",
        give: [Number.NaN, Number.NaN],
        want: true,
      },
      {
        name: "returns one text for maps of equal entries in another order",
        give: [
          new Map([
            ["a", 1],
            ["b", 2],
          ]),
          new Map([
            ["b", 2],
            ["a", 1],
          ]),
        ],
        want: true,
      },
      {
        name: "returns the text of its value for a boxed primitive",
        give: [Object(1), 1],
        want: true,
      },
      {
        name: "returns the text of its ISO 8601 string for a date",
        give: [new Date(0), "1970-01-01T00:00:00.000Z"],
        want: true,
      },
      {
        name: "returns the text of a list for a set",
        give: [new Set([1]), [1]],
        want: true,
      },
      {
        name: "returns the text of a list for a typed array",
        give: [Int16Array.of(1), [1]],
        want: true,
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          canonical(tt.give[0]) === canonical(tt.give[1]),
          tt.want,
          "the texts of the two values",
        );
      });
    }
  });

  describe("canonical", () => {
    const tests: { name: string; give: unknown; want: string }[] = [
      { name: "returns null for undefined", give: undefined, want: "null" },
      { name: "returns the text of a boolean", give: true, want: "bool:true" },
      {
        name: "returns the hexadecimal text of bytes",
        give: Uint8Array.of(0, 255),
        want: "bytes:00ff",
      },
      {
        name: "returns the text of each field of a record in order",
        give: { b: 1, a: "x" },
        want: 'record:["b"=number:1,"a"=string:"x"]',
      },
      { name: "returns the empty text for an error", give: new Error("e"), want: "" },
      {
        name: "returns the empty text for a promise",
        give: Promise.resolve(),
        want: "",
      },
      { name: "returns the empty text for a regular expression", give: /x/, want: "" },
      { name: "returns the empty text for a function", give: () => 1, want: "" },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, canonical(tt.give), tt.want, "the canonical text");
      });
    }
  });

  describe("sameJson", () => {
    const tests: { name: string; give: [unknown, unknown]; want: boolean }[] = [
      {
        name: "returns true for objects of the same members in another order",
        give: [
          { a: 1, b: [true, null] },
          { b: [true, null], a: 1 },
        ],
        want: true,
      },
      {
        name: "returns false for arrays of another order",
        give: [
          [1, 2],
          [2, 1],
        ],
        want: false,
      },
      {
        name: "returns false for an object of another member",
        give: [{ a: 1 }, { a: 2 }],
        want: false,
      },
      {
        name: "returns false for a string and a number of one text",
        give: ["1", 1],
        want: false,
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, sameJson(tt.give[0], tt.give[1]), tt.want, "the verdict");
      });
    }
  });
});
