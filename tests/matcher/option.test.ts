// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the relaxations of the comparison. It uses vitest's `expect`
 * alone, because the comparison reads them.
 */

import { describe, expect, it } from "vitest";
import {
  byIdentity,
  equateBy,
  equateEmpty,
  equateNans,
  settings,
  transformed,
} from "../../src/matcher/option.js";

/** Reports whether a value is a string. */
function isText(value: unknown): value is string {
  return typeof value === "string";
}

/** Reports whether a value is a number. */
function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** Returns the lower case of a string. */
function lower(text: string): string {
  return text.toLowerCase();
}

/** Returns the text of a number. */
function written(n: number): string {
  return String(n);
}

describe("option", () => {
  describe("equateEmpty", () => {
    it("returns the option of the kind equate-empty", () => {
      expect(equateEmpty()).toEqual({ kind: "equate-empty" });
    });
  });

  describe("equateNans", () => {
    it("returns the option of the kind equate-nans", () => {
      expect(equateNans()).toEqual({ kind: "equate-nans" });
    });
  });

  describe("byIdentity", () => {
    it("returns the option of the kind by-identity", () => {
      expect(byIdentity()).toEqual({ kind: "by-identity" });
    });
  });

  describe("equateBy", () => {
    it("returns the option of the kind equate-by with its guard and its transform", () => {
      expect(equateBy(isText, lower)).toEqual({
        kind: "equate-by",
        transform: { is: isText, f: lower },
      });
    });

    it("throws a TypeError for a guard that is no function", () => {
      expect(() => equateBy(3 as never, lower)).toThrow(
        new TypeError("equateBy: the guard 3 is no function"),
      );
    });

    it("throws a TypeError for a transform that is no function", () => {
      expect(() => equateBy(isText, null as never)).toThrow(
        new TypeError("equateBy: the transform null is no function"),
      );
    });
  });

  describe("settings", () => {
    const tests = [
      {
        name: "returns no relaxation for no option",
        give: [],
        want: {
          equateEmpty: false,
          equateNans: false,
          byIdentity: false,
          transforms: [],
        },
      },
      {
        name: "returns equateEmpty for its option",
        give: [equateEmpty()],
        want: {
          equateEmpty: true,
          equateNans: false,
          byIdentity: false,
          transforms: [],
        },
      },
      {
        name: "returns equateNans for its option",
        give: [equateNans()],
        want: {
          equateEmpty: false,
          equateNans: true,
          byIdentity: false,
          transforms: [],
        },
      },
      {
        name: "returns byIdentity for its option",
        give: [byIdentity()],
        want: {
          equateEmpty: false,
          equateNans: false,
          byIdentity: true,
          transforms: [],
        },
      },
      {
        name: "returns every relaxation that one of several options turns on",
        give: [byIdentity(), equateEmpty(), equateNans()],
        want: { equateEmpty: true, equateNans: true, byIdentity: true, transforms: [] },
      },
      {
        name: "returns the transforms in the order of the call",
        give: [equateBy(isText, lower), equateNans(), equateBy(isNumber, written)],
        want: {
          equateEmpty: false,
          equateNans: true,
          byIdentity: false,
          transforms: [
            { is: isText, f: lower },
            { is: isNumber, f: written },
          ],
        },
      },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        expect(settings(tt.give)).toEqual(tt.want);
      });
    }
  });

  describe("transformed", () => {
    it("returns the result of the transform whose guard accepts a value", () => {
      expect(transformed("AB", settings([equateBy(isText, lower)]))).toBe("ab");
    });

    it("returns a value that no guard accepts", () => {
      expect(transformed(3, settings([equateBy(isText, lower)]))).toBe(3);
    });

    it("returns the result of the last transform whose guard accepts a value", () => {
      const relax = settings([
        equateBy(isText, lower),
        equateBy(isText, (t) => t.length),
      ]);

      expect(transformed("AB", relax)).toBe(2);
    });
  });
});
