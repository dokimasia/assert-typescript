// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

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
    it("aborts the signal with an AbortError", async () => {
      const probe = new Probe(new Recorder(), undefined);
      await probe.end();

      expect((probe.signal.reason as Error).name).toBe("AbortError");
    });

    it("runs the cleanups after the signal aborts, the last registered first", async () => {
      const probe = new Probe(new Recorder(), undefined);
      const order: string[] = [];
      probe.cleanup(() => {
        order.push(`first ${probe.signal.aborted}`);
      });
      probe.cleanup(() => {
        order.push(`second ${probe.signal.aborted}`);
      });
      await probe.end();

      expect(order).toEqual(["second true", "first true"]);
    });

    it("returns what the first cleanup throws, after the later cleanups run", async () => {
      const probe = new Probe(new Recorder(), undefined);
      const busy = new Error("the port is busy");
      let ran = false;
      probe.cleanup(() => {
        ran = true;
      });
      probe.cleanup(() => {
        throw busy;
      });

      expect([await probe.end(), ran]).toEqual([{ value: busy }, true]);
    });

    it("keeps a failure in a cleanup as a failure of the body", async () => {
      const probe = new Probe(new Recorder(), undefined);
      probe.cleanup(() => {
        probe.fail("the cleanup failed");
      });

      expect([await probe.end(), probe.messages]).toEqual([
        undefined,
        ["the cleanup failed"],
      ]);
    });
  });

  describe("Body.cleanup", () => {
    it("awaits a cleanup that returns a promise before the next one runs", async () => {
      const probe = new Probe(new Recorder(), undefined);
      const order: string[] = [];
      probe.cleanup(() => {
        order.push("first");
      });
      probe.cleanup(async () => {
        await Promise.resolve();
        order.push("awaited");
      });
      await probe.end();

      expect(order).toEqual(["awaited", "first"]);
    });

    it("runs a cleanup that a cleanup registers in the same pass", async () => {
      const probe = new Probe(new Recorder(), undefined);
      const order: string[] = [];
      probe.cleanup(() => {
        order.push("registering");
        probe.cleanup(() => {
          order.push("registered");
        });
      });
      await probe.end();

      expect(order).toEqual(["registering", "registered"]);
    });

    it("runs a cleanup that arrives after the body ended at once", async () => {
      const probe = new Probe(new Recorder(), undefined);
      await probe.end();
      const order: string[] = [];
      probe.cleanup(() => {
        order.push("late");
      });

      expect(order).toEqual(["late"]);
    });
  });

  describe("Body.reportFault", () => {
    it("ends the body with the message of a fault that ends its call", async () => {
      const probe = new Probe(new Recorder(), undefined);
      await runOn(probe, (seat) => {
        seat.reportFault?.(new Error("the path is empty"), true);
        seat.record("after the fault");
      });

      expect(probe.messages).toEqual(["the path is empty"]);
    });

    it("passes a noted fault to the parent, and the body runs on", async () => {
      const noted = new Error("a file of the store is skipped");
      const parent = new Recorder();
      const probe = new Probe(parent, undefined);
      await runOn(probe, (seat) => {
        seat.reportFault?.(noted, false);
        seat.record("after the note");
      });

      expect([parent.faults, probe.messages]).toEqual([[noted], ["after the note"]]);
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

    it("runs the cleanups before it returns the seat", async () => {
      const order: string[] = [];
      await runOn(new Probe(new Recorder(), undefined), (seat) => {
        seat.cleanup?.(() => {
          order.push("cleaned");
        });
      });

      expect(order).toEqual(["cleaned"]);
    });

    it("rejects with what a cleanup throws when the body returns", async () => {
      const busy = new RangeError("the port is busy");

      await expect(
        runOn(new Probe(new Recorder(), undefined), (seat) => {
          seat.cleanup?.(() => {
            throw busy;
          });
        }),
      ).rejects.toBe(busy);
    });

    it("rejects with what the body throws over what a cleanup throws", async () => {
      const broke = new RangeError("the body broke");

      await expect(
        runOn(new Probe(new Recorder(), undefined), (seat) => {
          seat.cleanup?.(() => {
            throw new RangeError("the port is busy");
          });
          throw broke;
        }),
      ).rejects.toBe(broke);
    });
  });
});
