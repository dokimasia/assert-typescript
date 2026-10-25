// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the decoding of a corpus case's typed literals.
 *
 * A literal that the decoder cannot read stops the run, because a case
 * that became an empty one would pass having tested nothing.
 */

import { describe } from "vitest";
import { decode, type Literal, Objects } from "../../src/conformance/literal.js";
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
        check.isEqualTo(
          seat,
          decode(tt.give),
          tt.want,
          "the decoded value",
          equateNans(),
        );
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
        check.doesContain(
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

      check.isEqualTo(
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
});
