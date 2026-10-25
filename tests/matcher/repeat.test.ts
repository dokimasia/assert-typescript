// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the steps of a relation. It uses vitest's `expect` alone,
 * because the surfaces call the relations that use these steps.
 */

import { describe, expect, it } from "vitest";
import { equateNans, settings } from "../../src/matcher/option.js";
import {
  agree,
  attempt,
  failedAt,
  REPETITIONS,
  settle,
} from "../../src/matcher/repeat.js";
import { Mode } from "../../src/matcher/seat.js";
import { Running } from "../../src/matcher/verdict.js";
import { Recorder } from "../../src/seat.js";

/** The contract that every call passes. */
const MSG = "the stated contract";

/** The error of a step that throws. */
const boom = new Error("boom");

/** Returns the assertion and the detail of each failure that seat received. */
function reported(seat: Recorder): [string, unknown][] {
  return seat.failures.map((f) => [f.assertion, f.detail]);
}

describe("repeat", () => {
  describe("REPETITIONS", () => {
    it("is 32", () => {
      expect(REPETITIONS).toBe(32);
    });
  });

  describe("attempt", () => {
    it("returns the value of a step", async () => {
      expect(await attempt(() => 1)).toEqual({ ok: true, value: 1 });
    });

    it("returns what a step throws", async () => {
      expect(
        await attempt(() => {
          throw boom;
        }),
      ).toEqual({ ok: false, thrown: boom });
    });

    it("returns what the promise of a step rejects with", async () => {
      expect(await attempt(() => Promise.reject(boom))).toEqual({
        ok: false,
        thrown: boom,
      });
    });
  });

  describe("failedAt", () => {
    it("states the failure of the first step as first", () => {
      expect(failedAt(0, boom)).toEqual({ first: boom, second: null });
    });

    it("states the failure of a later step as second", () => {
      expect(failedAt(3, boom)).toEqual({ first: null, second: boom });
    });
  });

  describe("settle", () => {
    it("passes two steps whose results are equal", async () => {
      const seat = new Recorder();
      await settle(
        Running.of(seat),
        Mode.Fatal,
        "commutative",
        MSG,
        () => 1,
        () => 1,
        settings([]),
      );

      expect(seat.failures).toEqual([]);
    });

    it("fails two steps whose results differ", async () => {
      const seat = new Recorder();
      await settle(
        Running.of(seat),
        Mode.Fatal,
        "commutative",
        MSG,
        () => 1,
        () => 2,
        settings([]),
      );

      expect(reported(seat)).toEqual([["commutative", { first: 1, second: 2 }]]);
    });

    it("compares the results under the relaxations", async () => {
      const seat = new Recorder();
      await settle(
        Running.of(seat),
        Mode.Fatal,
        "commutative",
        MSG,
        () => Number.NaN,
        () => Number.NaN,
        settings([equateNans()]),
      );

      expect(seat.failures).toEqual([]);
    });

    it("fails at the second step when it throws", async () => {
      const seat = new Recorder();
      await settle(
        Running.of(seat),
        Mode.Fatal,
        "commutative",
        MSG,
        () => 1,
        () => {
          throw boom;
        },
        settings([]),
      );

      expect(reported(seat)).toEqual([["commutative", { first: null, second: boom }]]);
    });
  });

  describe("agree", () => {
    it("passes a step that returns the same result every time", async () => {
      const seat = new Recorder();
      await agree(
        Running.of(seat),
        Mode.Fatal,
        "deterministic",
        MSG,
        () => 7,
        settings([]),
      );

      expect(seat.failures).toEqual([]);
    });

    it("fails at the first result that differs from the first", async () => {
      const seat = new Recorder();
      let calls = 0;
      await agree(
        Running.of(seat),
        Mode.Fatal,
        "deterministic",
        MSG,
        () => {
          calls += 1;
          return calls > 3 ? "late" : "early";
        },
        settings([]),
      );

      expect(reported(seat)).toEqual([
        ["deterministic", { first: "early", second: "late" }],
      ]);
    });

    it("runs the step REPETITIONS times when every result agrees", async () => {
      let calls = 0;
      await agree(
        Running.of(new Recorder()),
        Mode.Fatal,
        "deterministic",
        MSG,
        () => {
          calls += 1;
        },
        settings([]),
      );

      expect(calls).toBe(REPETITIONS);
    });
  });
});
