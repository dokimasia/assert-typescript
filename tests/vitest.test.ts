/**
 * The spec of the vitest adapter, driven as a consumer's suite drives it.
 * It uses vitest's `expect` alone, because the other specs assert on the
 * seat that the adapter supplies.
 */

import { afterAll, beforeAll, describe, expect } from "vitest";
import * as check from "../src/check.js";
import * as seats from "../src/seat.js";
import * as soft from "../src/soft.js";
import { Collector, test as it, RECORDS, Recorder, Standard } from "../src/vitest.js";
import { setRecording } from "./helpers.js";

describe("vitest", () => {
  it("re-exports the seats of the module seat", () => {
    expect([Collector, Recorder, Standard]).toEqual([
      seats.Collector,
      seats.Recorder,
      seats.Standard,
    ]);
  });

  describe("RECORDS", () => {
    it("contains the key dokimi.assert", () => {
      expect(RECORDS).toBe("dokimi.assert");
    });
  });

  describe("test", () => {
    it("supplies a Collector as the seat", ({ seat }) => {
      expect(seat).toBeInstanceOf(Collector);
    });

    it("supplies a seat whose signal is the signal of the context", ({
      seat,
      signal,
    }) => {
      expect(seat.signal).toBe(signal);
    });

    it("supplies a seat that collects nothing of a passing assertion", ({ seat }) => {
      check.isNotNil(seat, {}, "it exists");
      soft.contains(seat, [1, 2], 1, "it is there");

      expect(seat.collected).toEqual([]);
    });

    it.fails("reports the failures that the seat collected when the body ends", ({
      seat,
    }) => {
      soft.equal(seat, 1, 2, "the first contract");
    });

    describe("with cleanups", () => {
      const ran: string[] = [];

      it("registers cleanups on the seat", ({ seat }) => {
        seat.cleanup(() => ran.push("first"));
        seat.cleanup(() => ran.push("second"));

        expect(ran).toEqual([]);
      });

      it("runs the cleanups of a test after its body, the last registered first", () => {
        expect(ran.splice(0)).toEqual(["second", "first"]);
      });

      it.fails("registers a cleanup in a test that fails", ({ seat }) => {
        seat.cleanup(() => ran.push("after a failure"));
        check.isTrue(seat, false, "the test fails");
      });

      it("runs the cleanups of a test that failed", () => {
        expect(ran.splice(0)).toEqual(["after a failure"]);
      });

      it.fails("fails a test whose cleanup throws", ({ seat }) => {
        seat.cleanup(() => {
          throw new Error("the directory is busy");
        });
      });
    });

    it("writes no call record into the task meta with recording off", ({
      seat,
      task,
    }) => {
      check.isTrue(seat, true, "the flag is set");

      expect(task.meta).not.toHaveProperty(RECORDS);
    });

    describe("with recording on", () => {
      let restore: () => void = () => undefined;
      beforeAll(() => {
        restore = setRecording("1");
      });
      afterAll(() => restore());

      it("writes the call record of each call into the task meta in call order", ({
        seat,
        task,
      }) => {
        check.isTrue(seat, true, "the first is true");
        soft.equal(seat, 1, 2, "the second fails");
        const records = (task.meta as Record<string, unknown>)[RECORDS] as Record<
          string,
          unknown
        >[];

        expect(
          records.map((r) => [r["seq"], r["assertion"], r["verdict"], r["aborting"]]),
        ).toEqual([
          [1, "true", "pass", true],
          [2, "equal", "fail", false],
        ]);
        expect(records[1]?.["detail"]).toEqual({
          want: { type: "int", value: 2 },
          got: { type: "int", value: 1 },
        });
        // The flush clears the recorded failure, which the fixture would
        // otherwise report when the body ends.
        expect(() => seat.flush()).toThrow("the second fails");
      });
    });
  });
});
