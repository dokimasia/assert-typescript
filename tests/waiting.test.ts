/**
 * The assertions that retry, and the one that checks nothing was left
 * running.
 *
 * These spend real time. The timeouts are the smallest that still tell
 * the outcomes apart.
 */

import { expect, it } from "vitest";
import * as check from "../src/check.js";
import type { Seat } from "../src/seat.js";
import { Recorder } from "../src/seat.js";

it("eventually reports the last attempt's own reason", async () => {
  const seat = new Recorder();
  await check.eventually(
    seat,
    20,
    5,
    (trial: Seat) => check.isTrue(trial, false, "the inner reason"),
    "it converges",
  );

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("the inner reason");
});

it("eventually passes once the body settles", async () => {
  let attempts = 0;
  const seat = new Recorder();
  await check.eventually(
    seat,
    1000,
    5,
    (trial: Seat) => {
      attempts += 1;
      check.isTrue(trial, attempts >= 3, "it settled");
    },
    "it converges",
  );

  expect(seat.failed, seat.message).toBe(false);
  expect(attempts).toBeGreaterThanOrEqual(3);
});

it("eventually runs the body at least once", async () => {
  let attempts = 0;
  const seat = new Recorder();
  await check.eventually(
    seat,
    0,
    1,
    () => {
      attempts += 1;
    },
    "it converges",
  );

  expect(attempts).toBe(1);
  expect(seat.failed).toBe(false);
});

it("eventuallyTrue reports the wait running out", async () => {
  const seat = new Recorder();
  await check.eventuallyTrue(seat, 20, () => false, "it settles");

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("still false");
});

it("eventuallyTrue passes a predicate that holds", async () => {
  const seat = new Recorder();
  await check.eventuallyTrue(seat, 1000, () => true, "it settles");

  expect(seat.failed, seat.message).toBe(false);
});

it("eventuallyTrue awaits an async predicate", async () => {
  const seat = new Recorder();
  await check.eventuallyTrue(seat, 1000, async () => true, "it settles");

  expect(seat.failed, seat.message).toBe(false);
});

it("noTaskLeaks reports a timer left running", () => {
  const seat = new Recorder();
  const done = check.noTaskLeaks(seat, "the handler cleans up");
  const timer = setTimeout(() => undefined, 5000);
  done();
  clearTimeout(timer);

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("still running");
});

it("noTaskLeaks passes when the scope leaves nothing behind", () => {
  const seat = new Recorder();
  const done = check.noTaskLeaks(seat, "the handler cleans up");
  const timer = setTimeout(() => undefined, 5000);
  clearTimeout(timer);
  done();

  expect(seat.failed, seat.message).toBe(false);
});
