// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions about a value. It uses vitest's `expect`
 * alone, because the surfaces call these assertions.
 */

import { describe } from "vitest";
import { equateEmpty, equateNans, type Option } from "../../src/matcher/option.js";
import { Mode } from "../../src/matcher/seat.js";
import * as value from "../../src/matcher/value.js";
import { verdictCases as cases, VERDICT_CONTRACT as MSG } from "../helpers.js";

describe("value", () => {
  describe("equal", () => {
    cases(
      "equal",
      (seat, [got, want, ...options]) =>
        value.equal(seat, Mode.Fatal, got, want, MSG, ...(options as Option[])),
      [
        { name: "passes equal values", give: [1, 1] },
        {
          name: "reports both values for different values",
          give: [1, 2],
          want: { want: 2, got: 1 },
        },
        {
          name: "reports null against an empty array",
          give: [null, []],
          want: { want: [], got: null },
        },
        {
          name: "passes null against an empty array under equateEmpty",
          give: [null, [], equateEmpty()],
        },
        {
          name: "reports two NaNs",
          give: [Number.NaN, Number.NaN],
          want: { want: Number.NaN, got: Number.NaN },
        },
        {
          name: "passes two NaNs under equateNans",
          give: [Number.NaN, Number.NaN, equateNans()],
        },
      ],
    );
  });

  describe("notEqual", () => {
    cases(
      "not-equal",
      (seat, [got, want]) => value.notEqual(seat, Mode.Fatal, got, want, MSG),
      [
        { name: "passes different values", give: [1, 2] },
        { name: "reports got for equal values", give: [1, 1], want: { got: 1 } },
      ],
    );
  });

  describe("isTrue", () => {
    cases(
      "true",
      (seat, [condition]) => value.isTrue(seat, Mode.Fatal, condition as boolean, MSG),
      [
        { name: "passes true", give: [true] },
        { name: "reports false without a detail", give: [false], want: {} },
      ],
    );
  });

  describe("isFalse", () => {
    cases(
      "false",
      (seat, [condition]) => value.isFalse(seat, Mode.Fatal, condition as boolean, MSG),
      [
        { name: "passes false", give: [false] },
        { name: "reports true without a detail", give: [true], want: {} },
      ],
    );
  });

  describe("isNil", () => {
    cases("nil", (seat, [got]) => value.isNil(seat, Mode.Fatal, got, MSG), [
      { name: "passes null", give: [null] },
      { name: "passes undefined", give: [undefined] },
      { name: "reports got for a present value", give: [0], want: { got: 0 } },
    ]);
  });

  describe("isNotNil", () => {
    cases("not-nil", (seat, [got]) => value.isNotNil(seat, Mode.Fatal, got, MSG), [
      { name: "passes a present value", give: [0] },
      { name: "reports undefined without a detail", give: [undefined], want: {} },
    ]);
  });

  describe("length", () => {
    cases(
      "length",
      (seat, [got, want]) => value.length(seat, Mode.Fatal, got, want as number, MSG),
      [
        { name: "passes a string of as many scalar values", give: ["é😀", 2] },
        { name: "passes an array of as many elements", give: [[1, 2], 2] },
        {
          name: "passes a typed array of as many elements",
          give: [Uint8Array.of(7, 8), 2],
        },
        { name: "passes a map of as many entries", give: [new Map([["a", 1]]), 1] },
        { name: "passes a set of as many members", give: [new Set([1, 2]), 2] },
        { name: "passes a plain object of as many keys", give: [{ a: 1, b: 2 }, 2] },
        {
          name: "reports want with got for a different length",
          give: [[1], 2],
          want: { want: 2, got: 1 },
        },
        {
          name: "reports got null for a value without a length",
          give: [42, 1],
          want: { want: 1, got: null },
        },
        {
          name: "reports got null for a string with a lone surrogate",
          give: ["a\uD800", 2],
          want: { want: 2, got: null },
        },
      ],
    );
  });

  describe("isEmpty", () => {
    cases("empty", (seat, [got]) => value.isEmpty(seat, Mode.Fatal, got, MSG), [
      { name: "passes an empty array", give: [[]] },
      {
        name: "reports got with its length for a value with an item",
        give: [[1]],
        want: { got: [1], length: 1 },
      },
      {
        name: "reports length null for a value without a length",
        give: [new Date(0)],
        want: { got: new Date(0), length: null },
      },
    ]);
  });

  describe("isNotEmpty", () => {
    cases("not-empty", (seat, [got]) => value.isNotEmpty(seat, Mode.Fatal, got, MSG), [
      { name: "passes an array with an item", give: [[1]] },
      { name: "reports got for the empty string", give: [""], want: { got: "" } },
      {
        name: "reports got for a value without a length",
        give: [42],
        want: { got: 42 },
      },
    ]);
  });

  describe("contains", () => {
    cases(
      "contains",
      (seat, [haystack, needle]) =>
        value.contains(seat, Mode.Fatal, haystack, needle, MSG),
      [
        { name: "passes text that contains the substring", give: ["hello", "ell"] },
        { name: "passes a map with the key", give: [new Map([["a", 1]]), "a"] },
        { name: "passes a set with the member", give: [new Set([1, 2]), 2] },
        {
          name: "passes a typed array with the element",
          give: [Uint8Array.of(7, 8), 8],
        },
        { name: "passes a plain object with the key", give: [{ etag: "x" }, "etag"] },
        {
          name: "reports a needle that is no key of a plain object",
          give: [{ a: 1 }, 1],
          want: { haystack: { a: 1 }, needle: 1 },
        },
        {
          name: "reports a haystack that cannot be searched",
          give: [42, 4],
          want: { haystack: 42, needle: 4 },
        },
        {
          name: "reports text against a needle that is no text",
          give: ["hello", 42],
          want: { haystack: "hello", needle: 42 },
        },
      ],
    );
  });

  describe("notContains", () => {
    cases(
      "not-contains",
      (seat, [haystack, needle]) =>
        value.notContains(seat, Mode.Fatal, haystack, needle, MSG),
      [
        { name: "passes a haystack without the needle", give: [[1], 2] },
        {
          name: "reports a haystack with the needle",
          give: [[1], 1],
          want: { haystack: [1], needle: 1 },
        },
        {
          name: "reports a haystack that cannot be searched",
          give: [42, 4],
          want: { haystack: 42, needle: 4 },
        },
      ],
    );
  });

  describe("closeTo", () => {
    cases(
      "close-to",
      (seat, [got, want, tolerance]) =>
        value.closeTo(seat, Mode.Fatal, got, want as number, tolerance as number, MSG),
      [
        { name: "passes a number within the tolerance", give: [1.04, 1, 0.05] },
        { name: "passes a bigint within the tolerance", give: [10n, 10, 0] },
        {
          name: "reports NaN within an infinite tolerance",
          give: [Number.NaN, 1, Number.POSITIVE_INFINITY],
          want: { got: Number.NaN, want: 1, tolerance: Number.POSITIVE_INFINITY },
        },
        {
          name: "reports a value that is no number",
          give: ["1", 1, 0.5],
          want: { got: "1", want: 1, tolerance: 0.5 },
        },
      ],
    );
  });

  describe("inRange", () => {
    cases(
      "in-range",
      (seat, [got, low, high]) =>
        value.inRange(seat, Mode.Fatal, got, low as number, high as number, MSG),
      [
        { name: "passes a number between the bounds", give: [5, 0, 10] },
        { name: "passes a bigint between the bounds", give: [5n, 0, 10] },
        {
          name: "reports a number in a range whose low is above its high",
          give: [5, 10, 1],
          want: { got: 5, low: 10, high: 1 },
        },
        {
          name: "reports NaN",
          give: [Number.NaN, 0, 10],
          want: { got: Number.NaN, low: 0, high: 10 },
        },
        {
          name: "reports a value that is no number",
          give: ["5", 0, 10],
          want: { got: "5", low: 0, high: 10 },
        },
      ],
    );
  });
});
