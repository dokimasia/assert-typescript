/**
 * The spec of the seat that an assertion makes for a body. It uses
 * vitest's `expect` alone, because `eventually` and `rejects` decide
 * their verdicts through it.
 */

import { describe, expect, it } from "vitest";
import { Body, Ended, runOn } from "../../src/matcher/body.js";
import { Mode } from "../../src/matcher/seat.js";
import { pass } from "../../src/matcher/verdict.js";
import { callsOf, own, Slot } from "../../src/record/calls.js";
import { Recorder } from "../../src/seat.js";
import { records } from "../helpers.js";

/** The seat of a body that keeps every message, and ends the body at a failure that stops. */
class Probe extends Body {
  readonly messages: string[] = [];

  fail(message: string): never {
    this.messages.push(message);
    throw new Ended();
  }

  record(message: string): void {
    this.messages.push(message);
  }
}

describe("body", () => {
  describe("new Body", () => {
    it("returns a seat whose signal has not aborted", () => {
      expect(new Probe(new Recorder(), undefined).signal.aborted).toBe(false);
    });

    it("returns a seat whose signal aborts when the signal of the parent aborts", () => {
      const parent = new AbortController();
      const probe = new Probe(new Recorder().withSignal(parent.signal), undefined);
      parent.abort();

      expect(probe.signal.aborted).toBe(true);
    });

    it("makes the calls on the seat a run of the call that the slot started", () => {
      const seat = new Recorder();
      const slot = Slot.begin(seat) as Slot;
      const probe = new Probe(seat, slot);
      pass(probe, Mode.Fatal, "true", "the inner call");
      slot.take(own(probe));
      slot.write({
        assertion: "eventually",
        contract: "the outer call",
        verdict: "pass",
        aborting: true,
      });

      expect(records(seat).map((r) => [r["seq"], r["parent"], r["run"]])).toEqual([
        [1, undefined, undefined],
        [2, 1, 1],
      ]);
    });

    it("returns a seat that records no call without a slot", () => {
      expect(callsOf(new Probe(new Recorder(), undefined))).toBeUndefined();
    });
  });

  describe("Body.helper", () => {
    it("sends the seat no message", () => {
      const probe = new Probe(new Recorder(), undefined);
      probe.helper();

      expect(probe.messages).toEqual([]);
    });
  });

  describe("Body.end", () => {
    it("aborts the signal with an AbortError", () => {
      const probe = new Probe(new Recorder(), undefined);
      probe.end();

      expect((probe.signal.reason as Error).name).toBe("AbortError");
    });
  });

  describe("runOn", () => {
    it("returns the seat once the body returns", async () => {
      const probe = new Probe(new Recorder(), undefined);

      expect(await runOn(probe, () => undefined)).toBe(probe);
    });

    it("awaits a body that returns a promise", async () => {
      const probe = new Probe(new Recorder(), undefined);
      await runOn(probe, async (seat) => {
        await Promise.resolve();
        seat.record("a later failure");
      });

      expect(probe.messages).toEqual(["a later failure"]);
    });

    it("ends the run at a failure that throws Ended", async () => {
      const probe = new Probe(new Recorder(), undefined);
      await runOn(probe, (seat) => {
        seat.fail("the first");
        seat.record("the second");
      });

      expect(probe.messages).toEqual(["the first"]);
    });

    it("rejects with what the body throws that is not Ended", async () => {
      const boom = new RangeError("the body broke");

      await expect(
        runOn(new Probe(new Recorder(), undefined), () => {
          throw boom;
        }),
      ).rejects.toBe(boom);
    });

    it("ends the seat when the body returns", async () => {
      const probe = await runOn(new Probe(new Recorder(), undefined), () => undefined);

      expect(probe.signal.aborted).toBe(true);
    });

    it("ends the seat when the body throws", async () => {
      const probe = new Probe(new Recorder(), undefined);
      await runOn(probe, () => {
        throw new RangeError("the body broke");
      }).catch(() => undefined);

      expect(probe.signal.aborted).toBe(true);
    });
  });
});
