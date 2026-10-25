// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the run of a forms vector's form. */

import { describe } from "vitest";
import {
  CONTRACT,
  FAILS,
  fn,
  kind,
  OWN,
  OwnError,
  PREDICATES,
  RAISES,
  type Run,
  subject,
} from "../../../src/conformance/prop/drive.js";
import { check } from "../../../src/index.js";
import { Fault } from "../../../src/matcher/fault.js";
import { test as it } from "../../../src/vitest.js";

/** Returns a run of the subject kinds subjects, whose integers are numbers. */
function runOf(...subjects: unknown[]): Run {
  return {
    subjects,
    args: [],
    options: [],
    bind: (value) => (Array.isArray(value) ? value.map(Number) : value),
    integer: (text) => Number(text),
  };
}

/** Returns the location and the reason of the fault that f throws. */
function faultOf(f: () => unknown): [string, string] | undefined {
  try {
    f();
  } catch (err) {
    if (err instanceof Fault) {
      return [err.at, err.reason];
    }
    throw err;
  }
  return undefined;
}

describe("drive", () => {
  describe("CONTRACT", () => {
    it("names the run of a forms vector", ({ seat }) => {
      check.isEqualTo(seat, CONTRACT, "the form of a forms vector", "the contract");
    });
  });

  describe("OWN", () => {
    it("is an error of the class OwnError", ({ seat }) => {
      check.errorAs(seat, OWN, OwnError, "the subject's own failure");
    });
  });

  describe("PREDICATES", () => {
    it("states ascending as a pair in order", ({ seat }) => {
      const ascending = PREDICATES.get("ascending");

      check.isEqualTo(
        seat,
        [ascending?.(1, 2), ascending?.(2, 2), ascending?.(3, 2)],
        [true, true, false],
        "the pairs in order",
      );
    });
  });

  describe("FAILS", () => {
    it("returns the subject's own failure for a negative input of fails-on-negative", ({
      seat,
    }) => {
      const fails = FAILS.get("fails-on-negative");

      check.isEqualTo(seat, [fails?.(-1), fails?.(1)], [OWN, null], "the failures");
    });
  });

  describe("RAISES", () => {
    it("throws the subject's own failure for raises", ({ seat }) => {
      check.isEqualTo(
        seat,
        check.doesThrow(seat, () => RAISES.get("raises")?.(0), "the subject throws"),
        OWN,
        "the subject's own failure",
      );
    });
  });

  describe("kind", () => {
    it("returns what the table states for the subject kind at an index", ({ seat }) => {
      check.isEqualTo(
        seat,
        kind(FAILS, runOf("returns-ok"), 0)(5),
        null,
        "the success of returns-ok",
      );
    });

    it("refuses a subject kind that the table does not state", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => kind(FAILS, runOf("returns-ok", "triples"), 1)),
        ["subjects[1]", '"triples" is no subject that the form takes'],
        "the fault at the subject",
      );
    });
  });

  describe("fn", () => {
    it("returns the function of the subject kind with its integers of the input", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        fn(runOf("prepends-zero"), 0)([1]),
        [0, 1],
        "the zero as a number",
      );
    });
  });

  describe("subject", () => {
    it("returns the subject that the first subject kind builds", ({ seat }) => {
      const built = subject(runOf("adds"), "combine");

      check.isEqualTo(seat, built.combine(2, 3), 5, "the sum");
    });

    it("refuses a subject kind that lacks a member", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => subject(runOf("adds"), "call", "observe")),
        ["subjects[0]", '"adds" is no subject that the form takes'],
        "the fault at the subject",
      );
    });
  });
});
