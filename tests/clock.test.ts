/** The spec of the clocks that an assertion reads time from. */

import { describe } from "vitest";
import { Controlled, System, wait } from "../src/clock.js";
import { check } from "../src/index.js";
import { test as it } from "../src/vitest.js";

describe("clock", () => {
  describe("System.now", () => {
    it("returns the reading of the platform clock in milliseconds", ({ seat }) => {
      const before = performance.now();
      const now = new System().now();

      check.inRange(
        seat,
        now,
        before,
        performance.now(),
        "the reading is the platform's",
      );
    });
  });

  describe("System.sleep", () => {
    it("resolves once the duration has passed on the platform clock", async ({
      seat,
    }) => {
      const started = performance.now();
      await new System().sleep(5);

      check.isTrue(
        seat,
        performance.now() - started >= 4,
        "the sleep took its duration",
      );
    });
  });

  describe("new Controlled", () => {
    it("returns a clock that reads its start", ({ seat }) => {
      check.equal(seat, new Controlled(100).now(), 100, "a new clock reads its start");
    });

    it("returns a clock that reads 0 without a start", ({ seat }) => {
      check.equal(seat, new Controlled().now(), 0, "a clock without a start reads 0");
    });
  });

  describe("Controlled.advance", () => {
    it("moves the clock forward by the duration", ({ seat }) => {
      const clock = new Controlled(100);
      clock.advance(30);

      check.equal(
        seat,
        clock.now(),
        130,
        "the clock reads its start plus the duration",
      );
    });

    it("leaves the clock unchanged for a duration that is not positive", ({ seat }) => {
      const clock = new Controlled(100);
      clock.advance(-30);
      clock.advance(0);

      check.equal(seat, clock.now(), 100, "time on the clock does not move backwards");
    });

    it("resolves each sleep that the new instant passed", async ({ seat }) => {
      const clock = new Controlled(0);
      const woke: number[] = [];
      const sleeping = [10, 20, 30].map((d) => clock.sleep(d).then(() => woke.push(d)));
      clock.advance(25);
      await Promise.all(sleeping.slice(0, 2));

      check.equal(seat, woke, [10, 20], "the sleeps of 10 and 20 ms resolved at 25 ms");
    });
  });

  describe("Controlled.sleep", () => {
    it("resolves only once the clock passes the duration", async ({ seat }) => {
      const clock = new Controlled(0);
      let settled = false;
      const sleeping = clock.sleep(60).then(() => {
        settled = true;
      });
      clock.advance(30);
      await Promise.resolve();
      check.isFalse(seat, settled, "the sleep waits while the clock is before its end");

      clock.advance(30);
      await sleeping;
      check.isTrue(seat, settled, "the sleep resolves once the clock passes its end");
    });

    it("resolves at once for a duration that is not positive", async ({ seat }) => {
      const clock = new Controlled(0);
      await clock.sleep(0);

      check.equal(seat, clock.now(), 0, "the sleep resolved without an advance");
    });
  });

  describe("wait", () => {
    it("advances a controlled clock by the duration", async ({ seat }) => {
      const clock = new Controlled(0);
      await wait(clock, 40);

      check.equal(seat, clock.now(), 40, "the wait advanced the clock");
    });

    it("sleeps on a clock other than a controlled one", async ({ seat }) => {
      const started = performance.now();
      await wait(new System(), 5);

      check.isTrue(
        seat,
        performance.now() - started >= 4,
        "the wait slept its duration",
      );
    });
  });
});
