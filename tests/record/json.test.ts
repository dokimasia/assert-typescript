// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the JSON text of a call record. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { json } from "../../src/record/json.js";
import { test as it } from "../../src/vitest.js";

describe("json", () => {
  describe("json", () => {
    it("returns one line with the keys of each object in their order", ({ seat }) => {
      check.isEqualTo(
        seat,
        json({ b: 1, a: [true, null, "x"], d: { e: 2 } }),
        '{"b":1,"a":[true,null,"x"],"d":{"e":2}}',
        "the line",
      );
    });

    it("leaves out a field whose value is undefined", ({ seat }) => {
      check.isEqualTo(seat, json({ a: 1, c: undefined }), '{"a":1}', "no field c");
    });

    it("writes -0 as -0", ({ seat }) => {
      check.isEqualTo(seat, json({ e: -0 }), '{"e":-0}', "the sign survives");
    });

    it("throws a TypeError for a number that is not finite", ({ seat }) => {
      const err = check.doesThrow(
        seat,
        () => json(Number.NaN),
        "NaN is no JSON number",
      );

      check.isTrue(seat, err instanceof TypeError, "the error is a TypeError");
    });

    it("throws a TypeError for a value that is no JSON value", ({ seat }) => {
      const err = check.doesThrow(seat, () => json(1n), "a bigint is no JSON value");

      check.isTrue(seat, err instanceof TypeError, "the error is a TypeError");
    });
  });
});
