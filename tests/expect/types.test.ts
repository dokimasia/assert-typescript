/**
 * The spec of the types of the standard's assertions on a runner's chain.
 * Its cases hold at compile time: `npm run types` checks them, and vitest
 * runs nothing that can fail.
 */

import { describe, expectTypeOf, it } from "vitest";
import type * as check from "../../src/check.js";
import type { Overlap, StandardMatchers } from "../../src/expect/types.js";

/** The matchers of a chain on a value of type T, as a runner whose synchronous matchers return nothing declares them. */
type On<T> = StandardMatchers<void, T>;

describe("types", () => {
  describe("StandardMatchers", () => {
    it("declares a matcher for each assertion of the function form", () => {
      expectTypeOf<keyof On<unknown>>().toEqualTypeOf<keyof typeof check>();
    });

    it("holds the want of isEqualTo to the type of the subject", () => {
      expectTypeOf<On<number>["isEqualTo"]>().parameter(0).toEqualTypeOf<number>();
    });

    it("takes what a promise subject resolves to as the want of isEqualTo", () => {
      expectTypeOf<On<Promise<number>>["isEqualTo"]>()
        .parameter(0)
        .toEqualTypeOf<Promise<number> | number>();
    });

    it("returns R from a synchronous matcher", () => {
      expectTypeOf<
        StandardMatchers<Promise<void>, number>["isTrue"]
      >().returns.toEqualTypeOf<Promise<void>>();
    });

    it("returns a promise from an asynchronous matcher", () => {
      expectTypeOf<On<() => void>["completesWithin"]>().returns.toEqualTypeOf<
        Promise<void>
      >();
    });

    it("types the predicate of pairwise over the elements of the subject", () => {
      expectTypeOf<On<readonly string[]>["pairwise"]>()
        .parameter(0)
        .toEqualTypeOf<(earlier: string, later: string) => boolean>();
    });

    it("types the want of isPermutation as an array of the elements of the subject", () => {
      expectTypeOf<On<number[]>["isPermutation"]>()
        .parameter(0)
        .toEqualTypeOf<readonly number[]>();
    });

    it("types the input of isIdempotent as the parameter of the subject", () => {
      expectTypeOf<On<(input: string) => void>["isIdempotent"]>()
        .parameter(0)
        .toEqualTypeOf<string>();
    });

    it("types the inverse of roundTrip over what the subject resolves to", () => {
      expectTypeOf<On<(input: number) => Promise<string>>["roundTrip"]>()
        .parameter(0)
        .toEqualTypeOf<(encoded: string) => unknown>();
    });
  });

  describe("Overlap", () => {
    it("takes a log in shadow mode", () => {
      expectTypeOf<Extract<Overlap, { mode: "shadow" }>>().toEqualTypeOf<{
        readonly mode: "shadow";
        readonly log: string;
      }>();
    });
  });
});
