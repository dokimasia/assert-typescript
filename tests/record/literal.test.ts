// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the typed literal of a value, as a call record states it. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { detail, encode, opaque } from "../../src/record/literal.js";
import { test as it } from "../../src/vitest.js";

/** A class whose instances have two own fields. */
class Point {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

/** Returns an array of a sparse array's shape: its middle element is a hole. */
function sparse(): unknown[] {
  const value: unknown[] = [];
  value[0] = 1;
  value[2] = 3;
  return value;
}

/** Returns a value that nests lists n deep around 1. */
function nested(n: number): unknown {
  return n === 0 ? 1 : [nested(n - 1)];
}

/** Returns an object of n keys. */
function keyed(n: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
}

/** An array that contains itself. */
const cycle: unknown[] = [];
cycle.push(cycle);

describe("literal", () => {
  describe("encode", () => {
    const tests: { name: string; give: unknown; want: unknown }[] = [
      { name: "returns null for null", give: null, want: { type: "null" } },
      { name: "returns null for undefined", give: undefined, want: { type: "null" } },
      {
        name: "returns a bool for a boolean",
        give: true,
        want: { type: "bool", value: true },
      },
      {
        name: "returns a string for a well-formed string",
        give: "é",
        want: { type: "string", value: "é" },
      },
      {
        name: "returns an int for a safe integer",
        give: 42,
        want: { type: "int", value: 42 },
      },
      {
        name: "returns a float for a number with a fraction",
        give: 1.5,
        want: { type: "float", value: 1.5 },
      },
      {
        name: "returns a float for an integer beyond the safe range",
        give: 2 ** 53,
        want: { type: "float", value: 2 ** 53 },
      },
      {
        name: "returns the float NaN by its name",
        give: Number.NaN,
        want: { type: "float", value: "NaN" },
      },
      {
        name: "returns the float Inf by its name",
        give: Number.POSITIVE_INFINITY,
        want: { type: "float", value: "Inf" },
      },
      {
        name: "returns the float -Inf by its name",
        give: Number.NEGATIVE_INFINITY,
        want: { type: "float", value: "-Inf" },
      },
      {
        name: "returns an int for a bigint in the safe range",
        give: 7n,
        want: { type: "int", value: 7 },
      },
      {
        name: "returns an int of its digits for a bigint above the safe range",
        give: 2n ** 64n - 1n,
        want: { type: "int", value: "18446744073709551615" },
      },
      {
        name: "returns an int of its digits for a bigint below the safe range",
        give: -(2n ** 53n),
        want: { type: "int", value: "-9007199254740992" },
      },
      {
        name: "returns bytes for a Uint8Array",
        give: Uint8Array.of(0, 255, 16),
        want: { type: "bytes", value: "00ff10" },
      },
      {
        name: "returns a list for a typed array of another type",
        give: Int16Array.of(-1, 2),
        want: { type: "list", of: "int", value: [-1, 2] },
      },
      {
        name: "returns the values of a list of one scalar type",
        give: [1, 2],
        want: { type: "list", of: "int", value: [1, 2] },
      },
      {
        name: "returns the items of a list of two scalar types",
        give: [1, 1.5],
        want: {
          type: "list",
          items: [
            { type: "int", value: 1 },
            { type: "float", value: 1.5 },
          ],
        },
      },
      {
        name: "returns no item of an empty list",
        give: [],
        want: { type: "list", items: [] },
      },
      {
        name: "returns a list for a set",
        give: new Set(["a"]),
        want: { type: "list", of: "string", value: ["a"] },
      },
      {
        name: "returns null for a hole of a sparse array",
        give: sparse(),
        want: {
          type: "list",
          items: [
            { type: "int", value: 1 },
            { type: "null" },
            { type: "int", value: 3 },
          ],
        },
      },
      {
        name: "returns the entries of a map in the order of the map",
        give: new Map<unknown, unknown>([
          ["b", 1],
          [Number.NaN, [true]],
        ]),
        want: {
          type: "map",
          entries: [
            [
              { type: "string", value: "b" },
              { type: "int", value: 1 },
            ],
            [
              { type: "float", value: "NaN" },
              { type: "list", of: "bool", value: [true] },
            ],
          ],
        },
      },
      {
        name: "returns a record of the own fields of a plain object in their order",
        give: { b: 1, a: "x" },
        want: {
          type: "record",
          fields: [
            ["b", { type: "int", value: 1 }],
            ["a", { type: "string", value: "x" }],
          ],
        },
      },
      {
        name: "returns a record of the own fields of an instance of a class",
        give: new Point(1, 2),
        want: {
          type: "record",
          fields: [
            ["x", { type: "int", value: 1 }],
            ["y", { type: "int", value: 2 }],
          ],
        },
      },
      {
        name: "returns the literal of the value of a boxed number",
        give: new Object(1),
        want: { type: "int", value: 1 },
      },
      {
        name: "returns the literal of the value of a boxed string",
        give: new Object("a"),
        want: { type: "string", value: "a" },
      },
      {
        name: "returns the literal of the value of a boxed bigint",
        give: new Object(3n),
        want: { type: "int", value: 3 },
      },
      {
        name: "returns the ISO 8601 string of a date",
        give: new Date(0),
        want: { type: "string", value: "1970-01-01T00:00:00.000Z" },
      },
      {
        name: "returns a string of 65,535 bytes",
        give: "x".repeat(65_535),
        want: { type: "string", value: "x".repeat(65_535) },
      },
      { name: "returns undefined for a function", give: () => 1, want: undefined },
      { name: "returns undefined for a symbol", give: Symbol("s"), want: undefined },
      { name: "returns undefined for an error", give: new Error("e"), want: undefined },
      {
        name: "returns undefined for a regular expression",
        give: /x/,
        want: undefined,
      },
      {
        name: "returns undefined for a promise",
        give: Promise.resolve(),
        want: undefined,
      },
      {
        name: "returns undefined for an AbortSignal",
        give: new AbortController().signal,
        want: undefined,
      },
      { name: "returns undefined for a WeakMap", give: new WeakMap(), want: undefined },
      {
        name: "returns undefined for a date that is not valid",
        give: new Date(Number.NaN),
        want: undefined,
      },
      {
        name: "returns undefined for a boxed symbol",
        give: new Object(Symbol("s")),
        want: undefined,
      },
      {
        name: "returns undefined for a thenable",
        // biome-ignore lint/suspicious/noThenProperty: a thenable is the value under test
        give: { then: () => undefined },
        want: undefined,
      },
      {
        name: "returns undefined for a string with a lone surrogate",
        give: "a\uD800",
        want: undefined,
      },
      {
        name: "returns undefined for an array of a function",
        give: [() => 1],
        want: undefined,
      },
      {
        name: "returns undefined for a map whose value is an error",
        give: new Map([[1, new Error("e")]]),
        want: undefined,
      },
      {
        name: "returns undefined for a map whose key is an error",
        give: new Map([[new Error("e"), 1]]),
        want: undefined,
      },
      {
        name: "returns undefined for an object whose field is a function",
        give: { f: () => 1 },
        want: undefined,
      },
      {
        name: "returns undefined for a literal nested deeper than 61 levels",
        give: nested(31),
        want: undefined,
      },
      {
        name: "returns undefined for a value that contains itself",
        give: cycle,
        want: undefined,
      },
      {
        name: "returns undefined for a string of 65,536 bytes",
        give: "x".repeat(65_536),
        want: undefined,
      },
      {
        name: "returns undefined for bytes of 65,536 parts",
        give: new Uint8Array(65_536),
        want: undefined,
      },
      {
        name: "returns undefined for a field name of 65,536 bytes",
        give: { ["x".repeat(65_536)]: 1 },
        want: undefined,
      },
      {
        name: "returns undefined for an array of 65,536 elements",
        give: new Array(65_536).fill(1),
        want: undefined,
      },
      {
        name: "returns undefined for a map of 32,768 entries",
        give: new Map(Array.from({ length: 32_768 }, (_, i) => [i, i])),
        want: undefined,
      },
      {
        name: "returns undefined for an object of 65,537 keys",
        give: keyed(65_537),
        want: undefined,
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.isEqualTo(
          seat,
          encode(tt.give) as unknown,
          tt.want,
          "the literal of the value",
        );
      });
    }

    it("returns a float for -0", ({ seat }) => {
      const literal = encode(-0);

      check.isEqualTo(seat, literal?.type, "float", "-0 is a float");
      check.isTrue(seat, Object.is(literal?.["value"], -0), "the value keeps its sign");
    });

    it("returns a literal that nests 61 levels", ({ seat }) => {
      check.isNotNil(
        seat,
        encode(nested(30)),
        "30 lists around a scalar nest 61 levels",
      );
    });
  });

  describe("opaque", () => {
    it("returns the opaque literal of the text", ({ seat }) => {
      check.isEqualTo(
        seat,
        opaque("Error: boom"),
        { type: "opaque", text: "Error: boom" },
        "opaque",
      );
    });
  });

  describe("detail", () => {
    it("returns the typed literal of a value with one", ({ seat }) => {
      check.isEqualTo(seat, detail(1), { type: "int", value: 1 }, "an int");
    });

    it("returns the opaque literal of the text of an error", ({ seat }) => {
      check.isEqualTo(
        seat,
        detail(new Error("boom")),
        opaque("Error: boom"),
        "the error's text",
      );
    });

    it("returns the opaque literal of the text of a function", ({ seat }) => {
      check.isEqualTo(
        seat,
        detail(function named() {
          // The literal states the name of the function alone.
        }),
        opaque("[function named]"),
        "the function's text",
      );
    });
  });
});
