/**
 * The spec of the seats that an assertion reports through. It uses
 * vitest's `expect` alone, because every other spec asserts on a seat.
 */

import { describe, expect, it } from "vitest";
import * as check from "../src/check.js";
import { Controlled, System } from "../src/clock.js";
import { Failure } from "../src/failure.js";
import { track } from "../src/matcher/pending.js";
import { signalOf as matcherSignalOf } from "../src/matcher/seat.js";
import {
  AssertionFailed,
  Collector,
  cleanUp,
  Recorder,
  Standard,
  signalOf,
} from "../src/seat.js";
import * as soft from "../src/soft.js";
import { ignores, records } from "./helpers.js";

/** Returns once every callback that the event loop has queued has run. */
function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Returns the report of a flush that names the assertions nobody awaited. */
function forgotten(...msgs: string[]): string {
  const listed = msgs.map((msg) => `  - ${msg}`).join("\n");
  return (
    `${msgs.length} assertion(s) were never awaited, so they asserted nothing:\n` +
    `${listed}\nAdd \`await\` to the call.`
  );
}

describe("seat", () => {
  describe("new AssertionFailed", () => {
    it("returns an error named AssertionFailed with the message", () => {
      const failed = new AssertionFailed("the stated contract");

      expect([failed.name, failed.message]).toEqual([
        "AssertionFailed",
        "the stated contract",
      ]);
    });
  });

  describe("Standard.helper", () => {
    it("returns without a failure", () => {
      expect(() => new Standard().helper()).not.toThrow();
    });
  });

  describe("Standard.fail", () => {
    it("throws AssertionFailed with the message", () => {
      expect(() => new Standard().fail("the stated contract")).toThrow(
        new AssertionFailed("the stated contract"),
      );
    });
  });

  describe("Standard.record", () => {
    it("throws AssertionFailed with the message", () => {
      expect(() => new Standard().record("the stated contract")).toThrow(
        new AssertionFailed("the stated contract"),
      );
    });
  });

  describe("Standard.flush", () => {
    it("throws the assertions that nobody awaited", () => {
      const seat = new Standard();
      void track(seat, "the subject stops", Promise.resolve());

      expect(() => seat.flush()).toThrow(
        new AssertionFailed(forgotten("the subject stops")),
      );
    });

    it("returns when every assertion was awaited", async () => {
      const seat = new Standard();
      await track(seat, "the subject stops", Promise.resolve());

      expect(() => seat.flush()).not.toThrow();
    });
  });

  describe("new Recorder", () => {
    it("returns a recorder that has received nothing", () => {
      const seat = new Recorder();

      expect([seat.failed, seat.message, seat.failures, seat.records]).toEqual([
        false,
        "",
        [],
        [],
      ]);
    });

    it("returns a recorder that keeps the call record of each call", () => {
      const seat = new Recorder();
      check.isTrue(seat, true, "the count is right");
      check.isTrue(seat, false, "it fails");

      expect(records(seat).map((r) => r["verdict"])).toEqual(["pass", "fail"]);
    });
  });

  describe("Recorder.report", () => {
    const failure = new Failure("equal", "the count is right", { want: 1, got: 2 });

    it("keeps the record of the failure", () => {
      const seat = new Recorder();
      seat.report(failure, true);

      expect(seat.failures).toEqual([failure]);
    });

    it("sends the sentence of an aborting failure to fail", () => {
      const seat = new Recorder();
      seat.report(failure, true);

      expect([seat.message, seat.messages]).toEqual([
        "the count is right: want 1, got 2",
        [],
      ]);
    });

    it("sends the sentence of a recording failure to record", () => {
      const seat = new Recorder();
      seat.report(failure, false);

      expect(seat.messages).toEqual(["the count is right: want 1, got 2"]);
    });
  });

  describe("Recorder.failures", () => {
    it("returns no record of a message that was passed to fail without one", () => {
      const seat = new Recorder();
      seat.fail("a bare message");

      expect(seat.failures).toEqual([]);
    });
  });

  describe("Recorder.records", () => {
    it("returns the call records in the order of their numbers", () => {
      const seat = new Recorder();
      check.isTrue(seat, true, "the first");
      soft.isTrue(seat, true, "the second");

      expect(records(seat).map((r) => [r["seq"], r["contract"]])).toEqual([
        [1, "the first"],
        [2, "the second"],
      ]);
    });
  });

  describe("Recorder.clock", () => {
    it("returns the platform clock for a recorder without one", () => {
      expect(new Recorder().clock()).toBeInstanceOf(System);
    });

    it("returns the clock that withClock set", () => {
      const clock = new Controlled(100);

      expect(new Recorder().withClock(clock).clock()).toBe(clock);
    });
  });

  describe("Recorder.withClock", () => {
    it("returns the recorder", () => {
      const seat = new Recorder();

      expect(seat.withClock(new Controlled(0))).toBe(seat);
    });
  });

  describe("Recorder.signal", () => {
    it("returns undefined for a recorder without a signal", () => {
      expect(new Recorder().signal).toBeUndefined();
    });

    it("returns the signal that withSignal set", () => {
      const signal = new AbortController().signal;

      expect(new Recorder().withSignal(signal).signal).toBe(signal);
    });
  });

  describe("Recorder.withSignal", () => {
    it("returns the recorder", () => {
      const seat = new Recorder();

      expect(seat.withSignal(new AbortController().signal)).toBe(seat);
    });
  });

  describe("Recorder.helper", () => {
    it("counts each call", () => {
      const seat = new Recorder();
      seat.helper();
      seat.helper();

      expect(seat.helperCalls).toBe(2);
    });
  });

  describe("Recorder.fail", () => {
    it("keeps the first message", () => {
      const seat = new Recorder();
      seat.fail("the first");
      seat.fail("the second");

      expect(seat.message).toBe("the first");
    });
  });

  describe("Recorder.record", () => {
    it("keeps every message in call order", () => {
      const seat = new Recorder();
      seat.record("the first");
      seat.record("the second");

      expect(seat.messages).toEqual(["the first", "the second"]);
    });
  });

  describe("Recorder.failed", () => {
    it("returns true after a message to fail", () => {
      const seat = new Recorder();
      seat.fail("the stated contract");

      expect(seat.failed).toBe(true);
    });

    it("returns true after a message to record", () => {
      const seat = new Recorder();
      seat.record("the stated contract");

      expect(seat.failed).toBe(true);
    });
  });

  describe("Recorder.message", () => {
    it("returns the message of fail before a message of record", () => {
      const seat = new Recorder();
      seat.record("the recorded one");
      seat.fail("the fatal one");

      expect(seat.message).toBe("the fatal one");
    });

    it("returns the first message of record without a message of fail", () => {
      const seat = new Recorder();
      seat.record("the first");
      seat.record("the second");

      expect(seat.message).toBe("the first");
    });
  });

  describe("Recorder.messages", () => {
    it("returns no message of fail", () => {
      const seat = new Recorder();
      seat.fail("the fatal one");

      expect(seat.messages).toEqual([]);
    });
  });

  describe("Recorder.helperCalls", () => {
    it("returns 0 for a recorder that received no helper call", () => {
      expect(new Recorder().helperCalls).toBe(0);
    });
  });

  describe("Collector.helper", () => {
    it("collects nothing", () => {
      const seat = new Collector();
      seat.helper();

      expect(seat.collected).toEqual([]);
    });
  });

  describe("Collector.fail", () => {
    it("throws AssertionFailed with the message", () => {
      expect(() => new Collector().fail("the stated contract")).toThrow(
        new AssertionFailed("the stated contract"),
      );
    });
  });

  describe("Collector.record", () => {
    it("collects the message", () => {
      const seat = new Collector();
      seat.record("the stated contract");

      expect(seat.collected).toEqual(["the stated contract"]);
    });
  });

  describe("Collector.collected", () => {
    it("returns the messages in call order", () => {
      const seat = new Collector();
      seat.record("the first");
      seat.record("the second");

      expect(seat.collected).toEqual(["the first", "the second"]);
    });
  });

  describe("Collector.signal", () => {
    it("returns undefined for a collector without a signal", () => {
      expect(new Collector().signal).toBeUndefined();
    });

    it("returns the signal that withSignal set", () => {
      const signal = new AbortController().signal;

      expect(new Collector().withSignal(signal).signal).toBe(signal);
    });
  });

  describe("Collector.withSignal", () => {
    it("returns the collector", () => {
      const seat = new Collector();

      expect(seat.withSignal(new AbortController().signal)).toBe(seat);
    });
  });

  describe("Collector.flush", () => {
    it("returns for a collector that collected nothing", () => {
      expect(() => new Collector().flush()).not.toThrow();
    });

    it("throws one collected message as itself", () => {
      const seat = new Collector();
      seat.record("the stated contract");

      expect(() => seat.flush()).toThrow(new AssertionFailed("the stated contract"));
    });

    it("throws several collected messages as a numbered list", () => {
      const seat = new Collector();
      seat.record("the first contract");
      seat.record("the second contract");

      expect(() => seat.flush()).toThrow(
        new AssertionFailed(
          "2 failures:\n  1. the first contract\n  2. the second contract",
        ),
      );
    });

    it("drops the messages that it threw", () => {
      const seat = new Collector();
      seat.record("the stated contract");
      expect(() => seat.flush()).toThrow(AssertionFailed);

      expect(seat.collected).toEqual([]);
    });

    it("throws the assertions that nobody awaited", () => {
      const seat = new Collector();
      void track(seat, "the fetch has a deadline", Promise.resolve());

      expect(() => seat.flush()).toThrow(
        new AssertionFailed(forgotten("the fetch has a deadline")),
      );
    });

    it("reports an assertion that nobody awaited once", () => {
      const seat = new Collector();
      void track(seat, "it stops when told", Promise.resolve());
      expect(() => seat.flush()).toThrow(AssertionFailed);

      expect(() => seat.flush()).not.toThrow();
    });

    it("reports an assertion that nobody awaited after it settled", async () => {
      const seat = new Collector();
      void check.honoursCancellation(seat, ignores, "it stops when told");
      await settled();

      expect(() => seat.flush()).toThrow(
        new AssertionFailed(forgotten("it stops when told")),
      );
    });

    it("reports the failure of an awaited recording assertion", async () => {
      const seat = new Collector();
      await soft.honoursCancellation(seat, ignores, "it stops when told");

      expect(() => seat.flush()).toThrow(
        new AssertionFailed("it stops when told: got null"),
      );
    });

    it("reports no assertion of another seat", () => {
      const forgetful = new Collector();
      void track(forgetful, "it stops when told", Promise.resolve());

      expect(() => new Collector().flush()).not.toThrow();
    });
  });

  describe("Collector.cleanup", () => {
    it("registers a function that cleanUp runs", () => {
      const seat = new Collector();
      let ran = false;
      seat.cleanup(() => {
        ran = true;
      });
      cleanUp(seat);

      expect(ran).toBe(true);
    });
  });

  describe("cleanUp", () => {
    it("runs the functions of the collector, the last registered first", () => {
      const seat = new Collector();
      const order: number[] = [];
      seat.cleanup(() => order.push(1));
      seat.cleanup(() => order.push(2));
      cleanUp(seat);

      expect(order).toEqual([2, 1]);
    });

    it("runs each function once", () => {
      const seat = new Collector();
      let runs = 0;
      seat.cleanup(() => {
        runs += 1;
      });
      cleanUp(seat);
      cleanUp(seat);

      expect(runs).toBe(1);
    });

    it("records the error of a function that throws, and runs the ones after it", () => {
      const seat = new Collector();
      let ran = false;
      seat.cleanup(() => {
        ran = true;
      });
      seat.cleanup(() => {
        throw new Error("the directory is busy");
      });
      cleanUp(seat);

      expect([ran, seat.collected]).toEqual([
        true,
        ["a cleanup failed: the directory is busy"],
      ]);
    });

    it("runs nothing for a collector that registered nothing", () => {
      const seat = new Collector();
      cleanUp(seat);

      expect(seat.collected).toEqual([]);
    });
  });

  describe("signalOf", () => {
    it("re-exports signalOf of the matcher", () => {
      expect(signalOf).toBe(matcherSignalOf);
    });
  });

  it("keeps no call record on a collector", () => {
    expect("records" in new Collector()).toBe(false);
  });

  it("keeps no call record on a standard seat", () => {
    expect("records" in new Standard()).toBe(false);
  });
});
