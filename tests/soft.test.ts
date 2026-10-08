/**
 * The spec of the surface that records a failure and lets the test carry
 * on. It uses vitest's `expect` alone, because the other specs assert with
 * the library's surfaces.
 */

import { describe, expect, it } from "vitest";
import * as check from "../src/check.js";
import { Controlled } from "../src/clock.js";
import { dropped } from "../src/matcher/pending.js";
import { Recorder } from "../src/seat.js";
import * as soft from "../src/soft.js";
import { FAILING, type Failing, TRACKED } from "./helpers.js";

/** The contract that every call passes. */
const MSG = "the stated contract";

/** Returns a recorder that reads a clock the test controls, with the clock. */
function seated(): [Recorder, Controlled] {
  const clock = new Controlled(0);
  return [new Recorder().withClock(clock), clock];
}

describe("soft", () => {
  it("exports an assertion for each failing call of the shared table", () => {
    expect(Object.keys(soft).sort()).toEqual(Object.keys(FAILING).sort());
  });

  for (const [name, call] of Object.entries(FAILING) as [string, Failing][]) {
    describe(name, () => {
      it("reports its failure through record", async () => {
        const [seat, clock] = seated();
        await call(soft, seat, clock, MSG);

        expect(seat.failures.map((f) => f.contract)).toEqual([MSG]);
        expect(seat.messages).toEqual([seat.message]);
      });

      it("reports the record of the failure that check reports", async () => {
        const [aborting, abortingClock] = seated();
        const [recording, recordingClock] = seated();
        await call(check, aborting, abortingClock, MSG);
        await call(soft, recording, recordingClock, MSG);

        expect(recording.failures).toEqual(aborting.failures);
      });

      if (TRACKED.includes(name)) {
        it("returns a promise that the forgotten-await guard tracks", async () => {
          const [seat, clock] = seated();
          const pending = call(soft, seat, clock, MSG);

          expect(dropped(seat)).toEqual([MSG]);
          await pending;
        });
      } else {
        it("returns no promise", () => {
          const [seat, clock] = seated();

          expect(call(soft, seat, clock, MSG)).not.toBeInstanceOf(Promise);
        });
      }
    });
  }
});
