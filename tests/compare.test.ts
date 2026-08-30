/**
 * Structural equality, and the JavaScript traps it has to answer for.
 *
 * Written with bare `expect`: this is the comparison every other
 * assertion reports through, so testing it with itself would let one
 * bug hide another.
 */

import { expect, it } from "vitest";
import { equal } from "../src/matcher/compare.js";
import { settings } from "../src/matcher/option.js";

const STRICT = settings([]);

it("reaches inside nested structures", () => {
  expect(equal({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }, STRICT)).toBe(true);
  expect(equal({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }, STRICT)).toBe(false);
});

it("says different shapes are never equal", () => {
  expect(equal([], {}, STRICT)).toBe(false);
  expect(equal(new Map(), {}, STRICT)).toBe(false);
  expect(equal(new Set([1]), [1], STRICT)).toBe(false);
});

it("does not coerce across types, as == would", () => {
  expect(equal(0, false, STRICT)).toBe(false);
  expect(equal("", false, STRICT)).toBe(false);
  expect(equal(1, "1", STRICT)).toBe(false);
  expect(equal(null, undefined, STRICT)).toBe(false);
});

it("says NaN does not equal itself", () => {
  expect(equal(Number.NaN, Number.NaN, STRICT)).toBe(false);
  expect(equal(Number.NaN, Number.NaN, settings([{ kind: "equate-nans" }]))).toBe(true);
});

it("tells the two zeroes apart the way Object.is does", () => {
  expect(equal(0, -0, STRICT)).toBe(true);
});

it("compares Map by key identity and value structure", () => {
  expect(equal(new Map([["a", { n: 1 }]]), new Map([["a", { n: 1 }]]), STRICT)).toBe(
    true,
  );
  expect(equal(new Map([["a", 1]]), new Map([["b", 1]]), STRICT)).toBe(false);
  expect(equal(new Map([["a", 1]]), new Map(), STRICT)).toBe(false);
});

it("compares Set without regard to order", () => {
  expect(equal(new Set([1, 2]), new Set([2, 1]), STRICT)).toBe(true);
  expect(equal(new Set([{ n: 1 }]), new Set([{ n: 1 }]), STRICT)).toBe(true);
  expect(equal(new Set([1]), new Set([2]), STRICT)).toBe(false);
});

it("compares Date by instant and RegExp by source", () => {
  expect(equal(new Date(0), new Date(0), STRICT)).toBe(true);
  expect(equal(new Date(0), new Date(1), STRICT)).toBe(false);
  expect(equal(/x/g, /x/g, STRICT)).toBe(true);
  expect(equal(/x/g, /x/i, STRICT)).toBe(false);
});

it("compares Error by name and message", () => {
  expect(equal(new Error("boom"), new Error("boom"), STRICT)).toBe(true);
  expect(equal(new Error("boom"), new TypeError("boom"), STRICT)).toBe(false);
});

it("says an absent collection is not an empty one", () => {
  expect(equal(null, [], STRICT)).toBe(false);
  expect(equal(null, [], settings([{ kind: "equate-empty" }]))).toBe(true);
  expect(equal(null, [1], settings([{ kind: "equate-empty" }]))).toBe(false);
});

it("stops on a cycle rather than overflowing", () => {
  interface Loop {
    n: number;
    self?: Loop;
  }
  const a: Loop = { n: 1 };
  a.self = a;
  const b: Loop = { n: 1 };
  b.self = b;

  expect(() => equal(a, b, STRICT)).not.toThrow();
  expect(equal(a, b, STRICT)).toBe(true);
});

it("says an object with extra keys is not equal", () => {
  expect(equal({ a: 1, b: 2 }, { a: 1 }, STRICT)).toBe(false);
  expect(equal({ a: 1 }, { a: 1, b: 2 }, STRICT)).toBe(false);
});
