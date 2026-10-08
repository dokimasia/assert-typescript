/**
 * The spec of the comparison that every assertion that compares reports
 * through. It uses vitest's `expect` alone, because a defect in the
 * comparison could pass a test written with it.
 */

import { describe, expect, it } from "vitest";
import { equal } from "../../src/matcher/compare.js";
import { type Relaxations, settings } from "../../src/matcher/option.js";

const STRICT = settings([]);
const NANS = settings([{ kind: "equate-nans" }]);
const EMPTY = settings([{ kind: "equate-empty" }]);
const IDENTITY = settings([{ kind: "by-identity" }]);

/** A value that contains itself. */
interface Loop {
  n: number;
  self?: Loop;
}

/** Returns an object that refers to itself. */
function loop(): Loop {
  const value: Loop = { n: 1 };
  value.self = value;
  return value;
}

/** Returns an object nested n levels deep. */
function deep(n: number): unknown {
  return n === 0 ? 1 : { next: deep(n - 1) };
}

const shared = { n: 1 };

describe("compare", () => {
  describe("equal", () => {
    const tests: {
      name: string;
      giveGot: unknown;
      giveWant: unknown;
      giveRelax?: Relaxations;
      want: boolean;
    }[] = [
      {
        name: "returns true for nested structures with equal leaves",
        giveGot: { a: [1, { b: 2 }] },
        giveWant: { a: [1, { b: 2 }] },
        want: true,
      },
      {
        name: "returns false for nested structures that differ at one leaf",
        giveGot: { a: [1, { b: 2 }] },
        giveWant: { a: [1, { b: 3 }] },
        want: false,
      },
      {
        name: "returns false for an array against an object",
        giveGot: [],
        giveWant: {},
        want: false,
      },
      {
        name: "returns false for a map against an object",
        giveGot: new Map(),
        giveWant: {},
        want: false,
      },
      {
        name: "returns false for a set against an array of its members",
        giveGot: new Set([1]),
        giveWant: [1],
        want: false,
      },
      {
        name: "returns false for 0 against false",
        giveGot: 0,
        giveWant: false,
        want: false,
      },
      {
        name: "returns false for the empty string against false",
        giveGot: "",
        giveWant: false,
        want: false,
      },
      {
        name: 'returns false for 1 against "1"',
        giveGot: 1,
        giveWant: "1",
        want: false,
      },
      {
        name: "returns false for null against undefined",
        giveGot: null,
        giveWant: undefined,
        want: false,
      },
      {
        name: "returns false for two NaNs",
        giveGot: Number.NaN,
        giveWant: Number.NaN,
        want: false,
      },
      {
        name: "returns true for two NaNs under equateNans",
        giveGot: Number.NaN,
        giveWant: Number.NaN,
        giveRelax: NANS,
        want: true,
      },
      { name: "returns true for -0 against 0", giveGot: -0, giveWant: 0, want: true },
      {
        name: "returns true for maps whose entries are equal",
        giveGot: new Map([["a", { n: 1 }]]),
        giveWant: new Map([["a", { n: 1 }]]),
        want: true,
      },
      {
        name: "returns false for maps whose keys differ",
        giveGot: new Map([["a", 1]]),
        giveWant: new Map([["b", 1]]),
        want: false,
      },
      {
        name: "returns false for maps of different sizes",
        giveGot: new Map([["a", 1]]),
        giveWant: new Map(),
        want: false,
      },
      {
        name: "returns false for maps whose values differ under one key",
        giveGot: new Map([["k", 1]]),
        giveWant: new Map([["k", 2]]),
        want: false,
      },
      {
        name: "returns true for maps whose object keys are equal structures",
        giveGot: new Map([[{ id: 1 }, "a"]]),
        giveWant: new Map([[{ id: 1 }, "a"]]),
        want: true,
      },
      {
        name: "returns true for maps whose keys are -0 against 0",
        giveGot: new Map([[-0, "a"]]),
        giveWant: new Map([[0, "a"]]),
        want: true,
      },
      {
        name: "returns false for maps whose keys are NaN",
        giveGot: new Map([[Number.NaN, "a"]]),
        giveWant: new Map([[Number.NaN, "a"]]),
        want: false,
      },
      {
        name: "returns true for maps whose keys are NaN under equateNans",
        giveGot: new Map([[Number.NaN, "a"]]),
        giveWant: new Map([[Number.NaN, "a"]]),
        giveRelax: NANS,
        want: true,
      },
      {
        name: "returns true for sets of the same members in another order",
        giveGot: new Set([1, 2]),
        giveWant: new Set([2, 1]),
        want: true,
      },
      {
        name: "returns true for sets whose members are equal structures",
        giveGot: new Set([{ n: 1 }]),
        giveWant: new Set([{ n: 1 }]),
        want: true,
      },
      {
        name: "returns false for sets whose members differ",
        giveGot: new Set([1]),
        giveWant: new Set([2]),
        want: false,
      },
      {
        name: "returns false for sets of different sizes",
        giveGot: new Set([1]),
        giveWant: new Set([1, 2]),
        want: false,
      },
      {
        name: "returns true for dates of one instant",
        giveGot: new Date(0),
        giveWant: new Date(0),
        want: true,
      },
      {
        name: "returns false for dates of different instants",
        giveGot: new Date(0),
        giveWant: new Date(1),
        want: false,
      },
      {
        name: "returns true for regular expressions of one source with the same flags",
        giveGot: /x/g,
        giveWant: /x/g,
        want: true,
      },
      {
        name: "returns false for regular expressions whose flags differ",
        giveGot: /x/g,
        giveWant: /x/i,
        want: false,
      },
      {
        name: "returns true for errors of one name with the same message",
        giveGot: new Error("boom"),
        giveWant: new Error("boom"),
        want: true,
      },
      {
        name: "returns false for errors whose names differ",
        giveGot: new Error("boom"),
        giveWant: new TypeError("boom"),
        want: false,
      },
      {
        name: "returns false for null against an empty array",
        giveGot: null,
        giveWant: [],
        want: false,
      },
      {
        name: "returns true for null against an empty array under equateEmpty",
        giveGot: null,
        giveWant: [],
        giveRelax: EMPTY,
        want: true,
      },
      {
        name: "returns false for null against an array with an item under equateEmpty",
        giveGot: null,
        giveWant: [1],
        giveRelax: EMPTY,
        want: false,
      },
      {
        name: "returns true for null against an empty map under equateEmpty",
        giveGot: null,
        giveWant: new Map(),
        giveRelax: EMPTY,
        want: true,
      },
      {
        name: "returns true for null against an empty set under equateEmpty",
        giveGot: null,
        giveWant: new Set(),
        giveRelax: EMPTY,
        want: true,
      },
      {
        name: "returns true for null against an empty object under equateEmpty",
        giveGot: null,
        giveWant: {},
        giveRelax: EMPTY,
        want: true,
      },
      {
        name: "returns false for null against a map with an entry under equateEmpty",
        giveGot: null,
        giveWant: new Map([["a", 1]]),
        giveRelax: EMPTY,
        want: false,
      },
      {
        name: "returns true for an empty array against null under equateEmpty",
        giveGot: [],
        giveWant: null,
        giveRelax: EMPTY,
        want: true,
      },
      {
        name: "returns true for an empty array against undefined under equateEmpty",
        giveGot: [],
        giveWant: undefined,
        giveRelax: EMPTY,
        want: true,
      },
      {
        name: "returns true for two cycles of equal values",
        giveGot: loop(),
        giveWant: loop(),
        want: true,
      },
      {
        name: "returns true for equal structures deeper than its depth limit",
        giveGot: deep(200),
        giveWant: deep(200),
        want: true,
      },
      {
        name: "returns false for an object with a key that the other lacks",
        giveGot: { a: 1, b: 2 },
        giveWant: { a: 1 },
        want: false,
      },
      {
        name: "returns false for an object that lacks a key of the other",
        giveGot: { a: 1 },
        giveWant: { a: 1, b: 2 },
        want: false,
      },
      {
        name: "returns true for one reference under byIdentity",
        giveGot: shared,
        giveWant: shared,
        giveRelax: IDENTITY,
        want: true,
      },
      {
        name: "returns false for two equal objects under byIdentity",
        giveGot: { n: 1 },
        giveWant: { n: 1 },
        giveRelax: IDENTITY,
        want: false,
      },
      {
        name: "returns false for two arrays of one element under byIdentity",
        giveGot: [shared],
        giveWant: [shared],
        giveRelax: IDENTITY,
        want: false,
      },
      {
        name: "returns false for two maps of one value under byIdentity",
        giveGot: new Map([["k", shared]]),
        giveWant: new Map([["k", shared]]),
        giveRelax: IDENTITY,
        want: false,
      },
      {
        name: "returns true for equal numbers under byIdentity",
        giveGot: 1,
        giveWant: 1,
        giveRelax: IDENTITY,
        want: true,
      },
      {
        name: "returns false for different strings under byIdentity",
        giveGot: "a",
        giveWant: "b",
        giveRelax: IDENTITY,
        want: false,
      },
      {
        name: "returns true for null against null under byIdentity",
        giveGot: null,
        giveWant: null,
        giveRelax: IDENTITY,
        want: true,
      },
      {
        name: "returns true for boxed primitives of one type with the same value",
        giveGot: Object(1),
        giveWant: Object(1),
        want: true,
      },
      {
        name: "returns false for boxed primitives whose values differ",
        giveGot: Object(1),
        giveWant: Object(2),
        want: false,
      },
      {
        name: "returns false for boxed primitives of different types",
        giveGot: Object(1),
        giveWant: Object("1"),
        want: false,
      },
      {
        name: "returns false for a boxed primitive against its value",
        giveGot: Object(1),
        giveWant: 1,
        want: false,
      },
      {
        name: "returns false for two boxed NaNs",
        giveGot: Object(Number.NaN),
        giveWant: Object(Number.NaN),
        want: false,
      },
      {
        name: "returns true for two boxed NaNs under equateNans",
        giveGot: Object(Number.NaN),
        giveWant: Object(Number.NaN),
        giveRelax: NANS,
        want: true,
      },
      {
        name: "returns true for typed arrays of one type with equal elements",
        giveGot: Uint8Array.of(1, 2),
        giveWant: Uint8Array.of(1, 2),
        want: true,
      },
      {
        name: "returns false for typed arrays whose elements differ",
        giveGot: Uint8Array.of(1, 2),
        giveWant: Uint8Array.of(1, 3),
        want: false,
      },
      {
        name: "returns false for typed arrays of different types",
        giveGot: Uint8Array.of(1),
        giveWant: Int8Array.of(1),
        want: false,
      },
      {
        name: "returns false for a typed array against an array",
        giveGot: Uint8Array.of(1),
        giveWant: [1],
        want: false,
      },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        expect(equal(tt.giveGot, tt.giveWant, tt.giveRelax ?? STRICT)).toBe(tt.want);
      });
    }
  });
});
