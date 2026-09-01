/**
 * Catching an asynchronous assertion nobody awaited.
 *
 * A forgotten await gives a green test that asserted nothing, and no
 * type checker catches it: the promise was used, it was just used as a
 * promise. This is the guard that does.
 */

import { expect, it } from "vitest";
import * as check from "../src/check.js";
import { dropped } from "../src/matcher/pending.js";
import { AssertionFailed, Collector, Recorder, Standard } from "../src/seat.js";
import * as soft from "../src/soft.js";

/** A subject that never looks at its signal, so the assertion fails. */
async function ignores(): Promise<string> {
  return "carried on regardless";
}

it("flush reports an assertion that was never awaited", () => {
  const seat = new Collector();
  check.honoursCancellation(seat, ignores, "it stops when told");

  expect(() => seat.flush()).toThrow(AssertionFailed);
  expect(() => seat.flush(), "a reported drop is not reported twice").not.toThrow();
});

it("the report names the contract that was dropped", () => {
  const seat = new Collector();
  check.honoursDeadline(seat, ignores, "the fetch has a deadline");

  expect(() => seat.flush()).toThrow("the fetch has a deadline");
});

it("an awaited assertion is not reported as dropped", async () => {
  const seat = new Collector();
  await check
    .honoursCancellation(seat, ignores, "it stops when told")
    .catch(() => undefined);

  expect(dropped(seat)).toEqual([]);
  expect(() => seat.flush()).not.toThrow();
});

it("an awaited recording assertion is not reported as dropped", async () => {
  const seat = new Collector();
  await soft.honoursCancellation(seat, ignores, "it stops when told");

  expect(dropped(seat)).toEqual([]);
  expect(() => seat.flush()).toThrow("it stops when told");
});

it("a dropped assertion does not become an unhandled rejection", async () => {
  const seat = new Collector();
  check.honoursCancellation(seat, ignores, "it stops when told");

  // Let every microtask run. Were the rejection unhandled, Node would
  // report it here rather than the flush below.
  await new Promise((resolve) => setImmediate(resolve));
  expect(() => seat.flush()).toThrow(AssertionFailed);
});

it("started work is tracked per seat, not globally", () => {
  const forgetful = new Collector();
  const clean = new Collector();
  check.honoursCancellation(forgetful, ignores, "it stops when told");

  expect(dropped(clean)).toEqual([]);
  expect(() => clean.flush()).not.toThrow();
});

it("a recorder does not police awaiting, since nothing flushes it", () => {
  const seat = new Recorder();
  check.honoursCancellation(seat, ignores, "it stops when told");

  expect(dropped(seat)).toHaveLength(1);
});

it("a dropped assertion is caught even after it has settled", async () => {
  const seat = new Collector();
  check.honoursCancellation(seat, ignores, "it stops when told");

  // A test body that awaits anything lets the dropped work settle.
  // Tracking whether it was still running would miss this entirely.
  await new Promise((resolve) => setImmediate(resolve));
  expect(() => seat.flush()).toThrow("never awaited");
});

it("the aborting seat reports an assertion that was never awaited", () => {
  // The aborting surface is the default, and a failure it throws inside
  // a dropped promise is gone by the time the test ends. Without an end
  // of its own it could never report the drop at all.
  const seat = new Standard();
  void check.honoursCancellation(seat, async () => {}, "the subject stops");

  expect(() => seat.flush()).toThrow(AssertionFailed);
});

it("the aborting seat flushes clean when everything was awaited", async () => {
  const seat = new Standard();
  await check.honoursCancellation(
    seat,
    // Rejecting with the signal's own reason is what honouring it means.
    async (signal?: AbortSignal) => {
      signal?.throwIfAborted();
    },
    "the subject stops",
  );

  expect(() => seat.flush()).not.toThrow();
});
