// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the scripts and the intervals of the history vectors. It uses
 * vitest's `expect` alone, because the runner of the history vectors checks
 * the library with it.
 */

import { describe, expect, it } from "vitest";
import { intervals, record } from "../../../src/conformance/history/script.js";
import { Fault } from "../../../src/matcher/fault.js";

/** The typed literal of the int 1. */
const ONE = { type: "int", value: 1 };

/** An entry that invokes call 1 of client 0, a write of 1 to no key. */
const INVOKE = { invoke: 1, client: 0, operation: "write", args: [ONE], keys: [] };

/** Returns the location and the reason of the fault that fn throws. */
function faultOf(fn: () => unknown): [string, string] | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof Fault) {
      return [err.at, err.reason];
    }
    throw err;
  }
  return undefined;
}

describe("script", () => {
  describe("record", () => {
    it("records each entry of the script through the seam", () => {
      const { history, refused } = record([INVOKE, { ok: 1, output: ONE }], "script");

      expect([history.events().length, refused]).toEqual([2, undefined]);
    });

    it("returns the entry whose call of the seam throws, and records none after it", () => {
      const { history, refused } = record(
        [INVOKE, { ok: 1, output: ONE }, { ok: 1, output: ONE }, INVOKE],
        "script",
      );

      expect([history.events().length, refused]).toEqual([2, 2]);
    });

    it("refuses a script that is no list", () => {
      expect(faultOf(() => record({}, "script"))).toEqual([
        "script",
        "the script is no list",
      ]);
    });

    it("refuses an entry that completes a call that the script does not open", () => {
      expect(faultOf(() => record([{ fail: 7, error: "e" }], "script"))).toEqual([
        "script[0]",
        "the entry completes call 7, which the script does not open",
      ]);
    });

    it("refuses an entry that states no call of the seam", () => {
      expect(faultOf(() => record([{}], "history"))).toEqual([
        "history[0]",
        "the entry states no call of the seam",
      ]);
    });

    it("refuses a value that is no typed literal", () => {
      expect(faultOf(() => record([{ ...INVOKE, args: [5] }], "script"))).toEqual([
        "script[0].args[0]",
        "the value is no typed literal",
      ]);
    });
  });

  describe("intervals", () => {
    it("returns the history of the intervals", () => {
      const { history, refused } = intervals([
        {
          client: 0,
          operation: "write",
          args: [ONE],
          keys: [],
          start: 1,
          end: 2,
          kind: "ok",
          output: ONE,
        },
      ]);

      expect([history?.events().length, refused]).toEqual([2, undefined]);
    });

    it("returns the entry that the history refuses", () => {
      const { history, refused } = intervals([
        {
          client: 0,
          operation: "write",
          args: [],
          keys: [],
          start: 1,
          end: 5,
          kind: "ok",
          output: ONE,
        },
        {
          client: 0,
          operation: "write",
          args: [],
          keys: [],
          start: 2,
          end: 3,
          kind: "ok",
          output: ONE,
        },
      ]);

      expect([history, refused]).toEqual([undefined, 1]);
    });

    it("refuses intervals that are no list", () => {
      expect(faultOf(() => intervals("x"))).toEqual([
        "intervals",
        "the intervals are no list",
      ]);
    });

    it("refuses an entry with an end and no completion kind", () => {
      expect(
        faultOf(() =>
          intervals([
            { client: 0, operation: "read", args: [], keys: [], start: 1, end: 2 },
          ]),
        ),
      ).toEqual([
        "intervals[0]",
        "the entry states a completion kind and an end, or neither",
      ]);
    });
  });
});
