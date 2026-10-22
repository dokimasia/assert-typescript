// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the types of the standard's assertions on jest's `expect`.
 * Its cases hold at compile time: `npm run types` checks them, and vitest
 * runs nothing that can fail.
 */

import type { expect as globals } from "@jest/globals";
import { describe, expectTypeOf, it } from "vitest";
import "../../src/jest/types.js";

/** The chain that the expect of `@jest/globals` returns for a value of type T. */
type Chain<T> = ReturnType<typeof globals<T>>;

/** The chain that `expect.soft` of `@jest/globals` returns for a value of type T. */
type Soft<T> = ReturnType<typeof globals.soft<T>>;

/** The global expect of `@types/jest`, whose type the namespace jest declares. */
declare const global: jest.Expect;

describe("types", () => {
  describe("Matchers of the module expect", () => {
    it("holds the want of isEqualTo to the type of the subject", () => {
      expectTypeOf<Chain<number>["isEqualTo"]>().parameter(0).toEqualTypeOf<number>();
    });

    it("returns nothing from a synchronous matcher", () => {
      expectTypeOf<Chain<number>["isTrue"]>().returns.toEqualTypeOf<void>();
    });

    it("returns a promise from a synchronous matcher under resolves", () => {
      expectTypeOf<
        Chain<Promise<number>>["resolves"]["isEqualTo"]
      >().returns.toEqualTypeOf<Promise<void>>();
    });
  });

  describe("BaseExpect.soft", () => {
    it("returns the matchers of the chain", () => {
      expectTypeOf<Soft<number>["isEqualTo"]>().parameter(0).toEqualTypeOf<number>();
    });

    it("returns the matchers under .not", () => {
      expectTypeOf<Soft<number>["not"]["isTrue"]>().returns.toEqualTypeOf<void>();
    });

    it("returns the matchers under resolves as matchers that return a promise", () => {
      expectTypeOf<Soft<Promise<number>>["resolves"]["isTrue"]>().returns.toEqualTypeOf<
        Promise<void>
      >();
    });
  });

  describe("Matchers of the namespace jest", () => {
    it("holds the want of isEqualTo to the type of the subject", () => {
      expectTypeOf<jest.Matchers<void, number>["isEqualTo"]>()
        .parameter(0)
        .toEqualTypeOf<number>();
    });
  });

  describe("Expect.soft of the namespace jest", () => {
    it("returns the matchers of the namespace jest", () => {
      expectTypeOf<
        ReturnType<typeof global.soft<number>>["isTrue"]
      >().returns.toEqualTypeOf<void>();
    });
  });
});
