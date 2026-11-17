// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of what the runners of the check vectors of histories share. It
 * uses vitest's `expect` alone, because these parts decide the verdict of
 * every check vector.
 */

import { describe, expect, it } from "vitest";
import * as check from "../../../src/check.js";
import {
  compareVerdict,
  linearizableRecord,
  namedSpec,
  optionsOf,
  type Raw,
  recordOf,
} from "../../../src/conformance/history/check.js";
import { SPECS } from "../../../src/conformance/history/specs.js";
import { History } from "../../../src/history/history.js";
import { configure } from "../../../src/history/option.js";
import type { Spec } from "../../../src/history/spec.js";
import { Fault } from "../../../src/matcher/fault.js";

/** Returns the place and the reason of the fault that fn throws. */
function faultOf(fn: () => unknown): [string, string] {
  try {
    fn();
  } catch (err) {
    if (err instanceof Fault) {
      return [err.at, err.reason];
    }
    throw err;
  }
  return ["", ""];
}

describe("check", () => {
  describe("recordOf", () => {
    it("returns the call record of the check as JSON", () => {
      const record = recordOf((seat) => check.isTrue(seat, true, "the flag is set"));

      expect([record["contract"], record["verdict"]]).toEqual([
        "the flag is set",
        "pass",
      ]);
    });
  });

  describe("linearizableRecord", () => {
    it("returns the call record of a check of linearizability", () => {
      const register = SPECS.get("register") as Spec<unknown>;
      const record = linearizableRecord(new History(), register, []);

      expect([record["assertion"], record["contract"], record["verdict"]]).toEqual([
        "linearizable",
        "the history of the vector is linearizable",
        "pass",
      ]);
    });
  });

  describe("compareVerdict", () => {
    it("returns for a pass that the vector expects", () => {
      expect(() =>
        compareVerdict({ verdict: "pass" }, { expect: "pass" }),
      ).not.toThrow();
    });

    it("returns for a failure of the fields that the vector states", () => {
      expect(() =>
        compareVerdict(
          { verdict: "fail", detail: { steps: 2, limit: null } },
          { expect: "fail", detail: { steps: 2 } },
        ),
      ).not.toThrow();
    });

    const tests: {
      name: string;
      giveCall: Raw;
      giveRaw: Raw;
      want: [string, string];
    }[] = [
      {
        name: "a vector that expects neither pass nor fail",
        giveCall: { verdict: "pass" },
        giveRaw: { expect: "maybe" },
        want: ["expect", 'the vector expects "maybe", neither pass nor fail'],
      },
      {
        name: "a call record of another verdict",
        giveCall: { verdict: "pass" },
        giveRaw: { expect: "fail", detail: {} },
        want: ["expect", "the check ends as pass, want fail"],
      },
      {
        name: "a detail without a field of the vector",
        giveCall: { verdict: "fail", detail: {} },
        giveRaw: { expect: "fail", detail: { steps: 2 } },
        want: ["detail.steps", "the record states no such field, want 2"],
      },
      {
        name: "a field of another value",
        giveCall: { verdict: "fail", detail: { steps: 3 } },
        giveRaw: { expect: "fail", detail: { steps: 2 } },
        want: ["detail.steps", "the field is 3, want 2"],
      },
    ];
    for (const tt of tests) {
      it(`throws a fault for ${tt.name}`, () => {
        expect(faultOf(() => compareVerdict(tt.giveCall, tt.giveRaw))).toEqual(tt.want);
      });
    }
  });

  describe("optionsOf", () => {
    it("returns the options that the vector states", () => {
      expect(configure(optionsOf({ budget: 5, "memo-limit": 7, workers: 2 }))).toEqual({
        budget: 5,
        memoLimit: 7,
        timeLimit: 0,
        checkpoint: undefined,
      });
    });

    it("returns no option for a vector that states none", () => {
      expect(optionsOf({})).toEqual([]);
    });

    it("throws a fault for a member below 1", () => {
      expect(faultOf(() => optionsOf({ "memo-limit": 0 }))).toEqual([
        "memo-limit",
        "the memo-limit is 0, no integer of 1 or more",
      ]);
    });
  });

  describe("namedSpec", () => {
    it("returns the named spec of the vector", () => {
      expect(namedSpec({ spec: "register" })).toBe(SPECS.get("register"));
    });

    it("throws a fault for a name that no spec has", () => {
      expect(faultOf(() => namedSpec({ spec: "widget" }))).toEqual([
        "spec",
        '"widget" is no named spec',
      ]);
    });
  });
});
