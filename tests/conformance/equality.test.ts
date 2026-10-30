// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the comparison of a reported value with one that a case states. */

import { describe } from "vitest";
import { canonical, sameJson } from "../../src/conformance/equality.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("equality", () => {
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
        give: [new Object(1), 1],
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
        check.isEqualTo(
          seat,
          canonical(tt.give[0]) === canonical(tt.give[1]),
          tt.want,
          "the texts of the two values",
        );
      });
    }

    const texts: { name: string; give: unknown; want: string }[] = [
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
      { name: "returns the empty text for a regular expression", give: /x/u, want: "" },
      { name: "returns the empty text for a function", give: () => 1, want: "" },
    ];

    for (const tt of texts) {
      it(tt.name, ({ seat }) => {
        check.isEqualTo(seat, canonical(tt.give), tt.want, "the canonical text");
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
        check.isEqualTo(seat, sameJson(tt.give[0], tt.give[1]), tt.want, "the verdict");
      });
    }
  });
});
