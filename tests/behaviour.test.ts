/**
 * The assertions built on JavaScript's own model rather than
 * translated.
 *
 * Go states cancellation with a context in every signature. JavaScript
 * has AbortSignal, which is what fetch, the stream APIs and
 * events.once all take. That makes these the assertions most likely to
 * be wrong, and the ones worth driving hardest.
 *
 * Every one is driven twice, once with a subject that holds and once
 * with one that does not. A one-sided test passes against an assertion
 * that reports nothing whatever it is given, which is a real way for
 * one of these to be wrong.
 */

import { expect, it } from "vitest";
import * as check from "../src/check.js";
import { Recorder } from "../src/seat.js";

/** A subject that waits for the signal and rejects when it aborts. */
async function respects(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason;
  await new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/** A subject that never looks at the signal. */
async function ignores(): Promise<string> {
  return "carried on regardless";
}

it("honoursCancellation passes a subject that checks the signal", async () => {
  const seat = new Recorder();
  await check.honoursCancellation(seat, respects, "it stops when told");

  expect(seat.failed, seat.message).toBe(false);
});

it("honoursCancellation reports a subject that ignores it", async () => {
  const seat = new Recorder();
  await check.honoursCancellation(seat, ignores, "it stops when told");

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.assertion).toBe("honours-cancellation");
});

it("honoursDeadline passes a subject that checks the signal", async () => {
  const seat = new Recorder();
  await check.honoursDeadline(seat, respects, "it respects its deadline");

  expect(seat.failed, seat.message).toBe(false);
});

it("honoursDeadline reports a subject that ignores it", async () => {
  const seat = new Recorder();
  await check.honoursDeadline(seat, ignores, "it respects its deadline");

  expect(seat.failed).toBe(true);
});

it("completesWithin passes a fast subject", async () => {
  const seat = new Recorder();
  await check.completesWithin(seat, 1000, () => undefined, "it is quick");

  expect(seat.failed, seat.message).toBe(false);
});

it("completesWithin reports a slow subject and names the ceiling", async () => {
  const seat = new Recorder();
  await check.completesWithin(
    seat,
    0,
    () => new Promise((r) => setTimeout(r, 5)),
    "it is quick",
  );

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.assertion).toBe("completes-within");
});

it("isPure passes when the projection holds", async () => {
  const state = [1, 2];
  const seat = new Recorder();
  await check.isPure(
    seat,
    () => [...state],
    () => undefined,
    "it changes nothing",
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("isPure reports when the projection changes", async () => {
  const state = [1, 2];
  const seat = new Recorder();
  await check.isPure(
    seat,
    () => [...state],
    () => state.push(3),
    "it changes nothing",
  );

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.assertion).toBe("pure");
});

it("isPure ignores what the projection leaves out", async () => {
  const state = { kept: 1, ignored: 0 };
  const seat = new Recorder();
  await check.isPure(
    seat,
    () => state.kept,
    () => {
      state.ignored = 1;
    },
    "it changes nothing observable",
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("nullHandleSafe passes a subject that refuses politely", async () => {
  const seat = new Recorder();
  await check.nullHandleSafe(
    seat,
    (signal) => {
      if (signal === undefined) throw new Error("a signal is required");
      return undefined;
    },
    "a missing handle is not fatal",
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("nullHandleSafe reports a subject that dereferences", async () => {
  const seat = new Recorder();
  await check.nullHandleSafe(
    seat,
    (signal) => (signal as AbortSignal).aborted,
    "a missing handle is not fatal",
  );

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.assertion).toBe("nil-context-safe");
});
