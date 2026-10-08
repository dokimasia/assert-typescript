/**
 * The spec of the rendering of a value into a failure's sentence. It uses
 * vitest's `expect` alone, because every failure's sentence contains it.
 */

import { describe, expect, it } from "vitest";
import { show } from "../../src/matcher/inspect.js";

/** A function with a name of its own. */
function named(): void {}

/** A function without a name: an arrow function in an array has none. */
const anonymous = [() => undefined][0];

describe("inspect", () => {
  describe("show", () => {
    const tests: { name: string; give: unknown; want: string }[] = [
      { name: "returns the empty string in quotes", give: "", want: '""' },
      { name: "returns a string in quotes", give: "hi", want: '"hi"' },
      { name: "returns null for null", give: null, want: "null" },
      { name: "returns undefined for undefined", give: undefined, want: "undefined" },
      { name: "returns NaN for NaN", give: Number.NaN, want: "NaN" },
      {
        name: "returns Infinity for infinity",
        give: Number.POSITIVE_INFINITY,
        want: "Infinity",
      },
      { name: "returns 0 for -0", give: -0, want: "0" },
      { name: "returns a bigint with the suffix n", give: 10n, want: "10n" },
      {
        name: "returns a symbol with its description",
        give: Symbol("tag"),
        want: "Symbol(tag)",
      },
      {
        name: "returns a function with its name",
        give: named,
        want: "[function named]",
      },
      {
        name: "returns a function without a name as anonymous",
        give: anonymous,
        want: "[function anonymous]",
      },
      {
        name: "returns the entries of a map",
        give: new Map([["a", 1]]),
        want: 'Map(1) {"a" => 1}',
      },
      {
        name: "returns the members of a set",
        give: new Set([1, 2]),
        want: "Set(2) {1, 2}",
      },
      {
        name: "returns a date as its ISO 8601 instant",
        give: new Date(0),
        want: "1970-01-01T00:00:00.000Z",
      },
      { name: "returns a regular expression as its literal", give: /x/g, want: "/x/g" },
      {
        name: "returns an error as its name with its message",
        give: new TypeError("boom"),
        want: "TypeError: boom",
      },
      {
        name: "returns the entries of a plain object",
        give: { a: 1, b: "two" },
        want: '{a: 1, b: "two"}',
      },
      {
        name: "returns an ellipsis for a value below the third level",
        give: { a: { b: { c: { d: 1 } } } },
        want: "{a: {b: {c: …}}}",
      },
      {
        name: "returns the first 200 characters of a longer rendering with an ellipsis",
        give: "x".repeat(500),
        want: `"${"x".repeat(199)}…`,
      },
      {
        name: "returns the items of an array",
        give: [1, "two", null],
        want: '[1, "two", null]',
      },
      { name: "returns true for true", give: true, want: "true" },
      { name: "returns a number as its decimal text", give: 1.5, want: "1.5" },
      {
        name: "returns a date of Temporal as its text",
        give: Temporal.PlainDate.from("2026-10-08"),
        want: "2026-10-08",
      },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        expect(show(tt.give)).toBe(tt.want);
      });
    }

    it("returns each bigint as its digits when the rendering states digits", () => {
      expect(show([10n, { a: -2n }], { digits: true })).toBe("[10, {a: -2}]");
    });
  });
});
