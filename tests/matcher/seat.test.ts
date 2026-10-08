/**
 * The spec of the interface that every assertion reports through. It uses
 * vitest's `expect` alone, because every verdict reaches the test through
 * it.
 */

import { describe, expect, it } from "vitest";
import { Controlled, System } from "../../src/clock.js";
import {
  clockOf,
  Mode,
  report,
  type Seat,
  signalOf,
  takesRecords,
} from "../../src/matcher/seat.js";
import { Collector, Recorder } from "../../src/seat.js";
import { Plain } from "../helpers.js";

describe("seat", () => {
  describe("Mode", () => {
    it("contains a mode for each surface", () => {
      expect(Mode).toEqual({ Fatal: "fatal", Soft: "soft" });
    });
  });

  describe("report", () => {
    it("sends the message to record under Mode.Soft", () => {
      const seat = new Plain();
      report(seat, Mode.Soft, "it holds");

      expect(seat.received).toEqual([["record", "it holds"]]);
    });

    it("sends the message to fail under Mode.Fatal", () => {
      const seat = new Plain();
      report(seat, Mode.Fatal, "it holds");

      expect(seat.received).toEqual([["fail", "it holds"]]);
    });

    it("marks the frame of the call as a helper", () => {
      const seat = new Plain();
      report(seat, Mode.Soft, "it holds");

      expect(seat.helpers).toBe(1);
    });
  });

  describe("takesRecords", () => {
    it("returns true for a seat with a report method", () => {
      expect(takesRecords(new Recorder())).toBe(true);
    });

    it("returns false for a seat without a report method", () => {
      expect(takesRecords(new Collector())).toBe(false);
    });
  });

  describe("clockOf", () => {
    it("returns the clock that the seat returns", () => {
      const clock = new Controlled(100);

      expect(clockOf(new Recorder().withClock(clock))).toBe(clock);
    });

    it("returns the platform clock for a seat without a clock method", () => {
      expect(clockOf(new Plain())).toBeInstanceOf(System);
    });

    it("returns the platform clock for a seat whose clock method returns nothing", () => {
      const seat = Object.assign(new Plain(), { clock: () => undefined }) as Seat;

      expect(clockOf(seat)).toBeInstanceOf(System);
    });
  });

  describe("signalOf", () => {
    it("returns the signal of a seat with one", () => {
      const signal = new AbortController().signal;

      expect(signalOf(new Recorder().withSignal(signal))).toBe(signal);
    });

    it("returns a signal that has not aborted for a seat without one", () => {
      expect(signalOf(new Plain()).aborted).toBe(false);
    });

    it("returns one signal for every seat without one", () => {
      expect(signalOf(new Collector())).toBe(signalOf(new Plain()));
    });
  });
});
