/** The clock a seat carries, and what a test can do with it. */

import { describe, expect, it } from "vitest";
import { Controlled, System } from "../src/clock.js";
import { check } from "../src/index.js";
import { Recorder } from "../src/seat.js";

describe("Controlled", () => {
  it("reads the start until something advances it", () => {
    const clock = new Controlled(100);

    expect(clock.now()).toBe(100);
    clock.advance(30);
    expect(clock.now()).toBe(130);
  });

  it("does not move time backwards", () => {
    const clock = new Controlled(100);
    clock.advance(-30);

    expect(clock.now()).toBe(100);
  });

  it("settles a sleep only once the clock passes it", async () => {
    const clock = new Controlled(0);
    let settled = false;
    const sleeping = clock.sleep(60).then(() => {
      settled = true;
    });

    clock.advance(30);
    await Promise.resolve();
    expect(settled, "it does not settle before the clock reaches it").toBe(false);

    clock.advance(30);
    await sleeping;
    expect(settled, "it settles once the clock passes the duration").toBe(true);
  });
});

describe("a seat's clock", () => {
  it("is the platform clock by default", () => {
    expect(new Recorder().clock()).toBeInstanceOf(System);
  });

  it("is what withClock supplied", () => {
    const seat = new Recorder().withClock(new Controlled(100));

    expect(seat.clock().now()).toBe(100);
  });
});

describe("eventually against a controlled clock", () => {
  it("gives up without spending real time", async () => {
    const seat = new Recorder().withClock(new Controlled(0));

    const started = performance.now();
    await check.eventually(
      seat,
      3_600_000,
      60_000,
      (inner) => {
        check.isTrue(inner, false, "never settles");
      },
      "the body settles",
    );
    const elapsed = performance.now() - started;

    expect(seat.failed, "a body that never settles reports").toBe(true);
    expect(elapsed, "an hour of controlled time costs no waiting").toBeLessThan(5000);
  });

  it("stops once the body settles", async () => {
    const seat = new Recorder().withClock(new Controlled(0));
    let attempts = 0;

    await check.eventually(
      seat,
      3_600_000,
      60_000,
      (inner) => {
        attempts += 1;
        check.isTrue(inner, attempts >= 3, "not yet");
      },
      "the body settles",
    );

    expect(seat.failed, "a body that settles is not reported").toBe(false);
    expect(attempts, "it stops once the body comes right").toBe(3);
  });
});
