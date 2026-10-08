/**
 * The spec of the register of the asynchronous assertions that a caller
 * never awaited. It uses vitest's `expect` alone, because a forgotten
 * await of an assertion of the library would pass a test that asserted
 * nothing.
 */

import { describe, expect, it } from "vitest";
import { clear, dropped, track } from "../../src/matcher/pending.js";
import { Recorder } from "../../src/seat.js";
import { Plain } from "../helpers.js";

/** Returns once every callback that the event loop has queued has run. */
function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("pending", () => {
  describe("track", () => {
    it("returns a promise that resolves with the value of the work", async () => {
      expect(await track(new Plain(), "the subject stops", Promise.resolve(7))).toBe(7);
    });

    it("returns a promise that rejects with the reason of the work", async () => {
      const boom = new Error("boom");

      await expect(
        track(new Plain(), "the subject stops", Promise.reject(boom)),
      ).rejects.toBe(boom);
    });

    it("marks the work awaited when the caller awaits the promise", async () => {
      const seat = new Plain();
      await track(seat, "the subject stops", Promise.resolve());

      expect(dropped(seat)).toEqual([]);
    });

    it("marks the work awaited when the caller calls then", () => {
      const seat = new Plain();
      void track(seat, "the subject stops", Promise.resolve()).then(() => undefined);

      expect(dropped(seat)).toEqual([]);
    });

    it("marks the work awaited when the caller calls catch", () => {
      const seat = new Plain();
      void track(seat, "the subject stops", Promise.resolve()).catch(() => undefined);

      expect(dropped(seat)).toEqual([]);
    });

    it("keeps a rejection that nobody awaited from becoming an unhandled rejection", async () => {
      const seat = new Plain();
      void track(seat, "the subject stops", Promise.reject(new Error("boom")));
      await settled();

      expect(dropped(seat)).toEqual(["the subject stops"]);
    });

    it("returns a promise whose chain of then calls resolves with the value of the work", async () => {
      const chained = track(new Plain(), "the subject stops", Promise.resolve(7))
        .then((value) => value + 1)
        .then((value) => value * 2);

      expect(await chained).toBe(16);
    });

    it("keeps the work of each seat apart", () => {
      const forgetful = new Plain();
      void track(forgetful, "the subject stops", Promise.resolve());

      expect(dropped(new Plain())).toEqual([]);
    });
  });

  describe("dropped", () => {
    it("returns the message of each work that nobody awaited", async () => {
      const seat = new Recorder();
      void track(seat, "the first", Promise.resolve());
      await track(seat, "the second", Promise.resolve());
      void track(seat, "the third", Promise.resolve());

      expect(dropped(seat)).toEqual(["the first", "the third"]);
    });

    it("returns the message of a work that settled before anyone awaited it", async () => {
      const seat = new Plain();
      void track(seat, "the subject stops", Promise.resolve());
      await settled();

      expect(dropped(seat)).toEqual(["the subject stops"]);
    });

    it("returns no message for a seat without tracked work", () => {
      expect(dropped(new Plain())).toEqual([]);
    });
  });

  describe("clear", () => {
    it("drops the tracked work of the seat", () => {
      const seat = new Plain();
      void track(seat, "the subject stops", Promise.resolve());
      clear(seat);

      expect(dropped(seat)).toEqual([]);
    });
  });
});
