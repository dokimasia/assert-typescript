/**
 * The spec of the relaxations of the comparison. It uses vitest's `expect`
 * alone, because the comparison reads them.
 */

import { describe, expect, it } from "vitest";
import {
  byIdentity,
  equateEmpty,
  equateNans,
  settings,
} from "../../src/matcher/option.js";

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

  describe("settings", () => {
    const tests = [
      {
        name: "returns no relaxation for no option",
        give: [],
        want: { equateEmpty: false, equateNans: false, byIdentity: false },
      },
      {
        name: "returns equateEmpty for its option",
        give: [equateEmpty()],
        want: { equateEmpty: true, equateNans: false, byIdentity: false },
      },
      {
        name: "returns equateNans for its option",
        give: [equateNans()],
        want: { equateEmpty: false, equateNans: true, byIdentity: false },
      },
      {
        name: "returns byIdentity for its option",
        give: [byIdentity()],
        want: { equateEmpty: false, equateNans: false, byIdentity: true },
      },
      {
        name: "returns every relaxation that one of several options turns on",
        give: [byIdentity(), equateEmpty(), equateNans()],
        want: { equateEmpty: true, equateNans: true, byIdentity: true },
      },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        expect(settings(tt.give)).toEqual(tt.want);
      });
    }
  });
});
