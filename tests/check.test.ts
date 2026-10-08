/**
 * The spec of the surface that stops the test at the first failure. It
 * uses vitest's `expect` alone, because the other specs assert with this
 * surface.
 */

import { describe, expect, it } from "vitest";
import * as check from "../src/check.js";
import { Controlled } from "../src/clock.js";
import { dropped } from "../src/matcher/pending.js";
import { rejects } from "../src/rejects.js";
import { Recorder } from "../src/seat.js";
import { FAILING, type Failing, TRACKED } from "./helpers.js";

/** The contract that every call passes. */
const MSG = "the stated contract";

/** Returns a recorder that reads a clock the test controls, with the clock. */
function seated(): [Recorder, Controlled] {
  const clock = new Controlled(0);
  return [new Recorder().withClock(clock), clock];
}

describe("check", () => {
  it("exports an assertion for each failing call of the shared table besides rejects", () => {
    expect(
      Object.keys(check)
        .filter((name) => name !== "rejects")
        .sort(),
    ).toEqual(Object.keys(FAILING).sort());
  });

  it("exports the rejects of the module rejects", () => {
    expect(check.rejects).toBe(rejects);
  });

  for (const [name, call] of Object.entries(FAILING) as [string, Failing][]) {
    describe(name, () => {
      it("reports its failure through fail", async () => {
        const [seat, clock] = seated();
        await call(check, seat, clock, MSG);

        expect(seat.failures.map((f) => f.contract)).toEqual([MSG]);
        expect(seat.message).not.toBe("");
        expect(seat.messages).toEqual([]);
      });

      if (TRACKED.includes(name)) {
        it("returns a promise that the forgotten-await guard tracks", async () => {
          const [seat, clock] = seated();
          const pending = call(check, seat, clock, MSG);

          expect(dropped(seat)).toEqual([MSG]);
          await pending;
        });
      } else {
        it("returns no promise", () => {
          const [seat, clock] = seated();

          expect(call(check, seat, clock, MSG)).not.toBeInstanceOf(Promise);
        });
      }
    });
  }
});
