/**
 * The two surfaces report the same thing.
 *
 * The corpus drives both for every assertion whose arguments it can
 * carry as data, which is 17 of the 41. The rest take a callable, a
 * signal or a timeout, and no corpus file can hold one. They are
 * covered here: each is driven through both surfaces against a
 * recorder, and the two messages must match.
 *
 * A recorder records whichever path an assertion takes, so the only
 * difference in this file is which module the name was read from.
 * That is the point: the surfaces are meant to differ in what they do
 * to the run, not in what they say.
 */

import { describe, expect, it } from "vitest";
import * as check from "../src/check.js";
import { Controlled } from "../src/clock.js";
import { Recorder } from "../src/seat.js";
import * as soft from "../src/soft.js";

/**
 * Answer a message with its measurements masked.
 *
 * A timing assertion reports how long the subject took and how many
 * attempts it made, and neither is the same twice. Masking them
 * compares everything the two surfaces are supposed to agree on and
 * nothing they cannot.
 */
function stable(message: string): string {
  return message
    .replace(/\d+(\.\d+)?ms/g, "<duration>")
    .replace(/\d+ attempts/g, "<attempts> attempts");
}

/** A subject that never looks at its signal. */
async function ignores(): Promise<string> {
  return "carried on regardless";
}

/** A subject that always throws. */
function boom(): never {
  throw new Error("boom");
}

const ERROR = new Error("boom");

/** Each entry answers fresh arguments, so a stateful case starts clean. */
//: Each case is built against the clock its seat reads, so a subject
//: that has to take time moves that clock rather than the wall.
const FAILING: Record<string, (clock: Controlled) => unknown[]> = {
  noError: () => [ERROR],
  hasError: () => [null],
  errorIs: () => [ERROR, TypeError],
  errorIsNot: () => [ERROR, ERROR],
  errorAs: () => [ERROR, TypeError],
  throws: () => [() => 1],
  doesNotThrow: () => [boom],
  pairwise: () => [[2, 1], (a: number, b: number) => a < b],
  honoursCancellation: () => [ignores],
  honoursDeadline: () => [ignores],
  completesWithin: (clock) => [
    0,
    () => {
      clock.advance(5);
      return Promise.resolve();
    },
  ],
  nullHandleSafe: () => [(s: AbortSignal) => s.aborted],
  isPure: () => {
    const state = [1];
    return [() => [...state], () => state.push(2)];
  },
  eventually: () => [
    5,
    1,
    (trial: Recorder) => check.isTrue(trial, false, "it converges"),
  ],
  eventuallyTrue: () => [5, () => false],
  rejectsWith: () => [() => Promise.resolve(1)],
};

describe("both surfaces report the same failure", () => {
  for (const name of Object.keys(FAILING).sort()) {
    it(name, async () => {
      const msg = "the stated contract";
      // Both seats read a clock the test controls, so an assertion
      // that measures or retries reports the same values on each
      // surface rather than two readings of a busy machine.
      const abortingClock = new Controlled(0);
      const recordingClock = new Controlled(0);
      const aborting = new Recorder().withClock(abortingClock);
      const recording = new Recorder().withClock(recordingClock);

      const asCheck = check as unknown as Record<string, (...a: unknown[]) => unknown>;
      const asSoft = soft as unknown as Record<string, (...a: unknown[]) => unknown>;

      const build = FAILING[name] as (clock: Controlled) => unknown[];
      await asCheck[name]?.(aborting, ...build(abortingClock), msg);
      await asSoft[name]?.(recording, ...build(recordingClock), msg);

      expect(aborting.failed, `check.${name} reports`).toBe(true);
      expect(recording.failed, `soft.${name} reports`).toBe(true);
      expect(stable(recording.message)).toBe(stable(aborting.message));
    });
  }
});

describe("the recording surface records rather than stopping", () => {
  for (const name of Object.keys(FAILING).sort()) {
    it(name, async () => {
      const clock = new Controlled(0);
      const seat = new Recorder().withClock(clock);
      const asSoft = soft as unknown as Record<string, (...a: unknown[]) => unknown>;

      const build = FAILING[name] as (clock: Controlled) => unknown[];
      await asSoft[name]?.(seat, ...build(clock), "first");
      await asSoft[name]?.(seat, ...build(clock), "second");

      expect(seat.messages).toHaveLength(2);
    });
  }
});

it("noTaskLeaks reports the same on both surfaces", () => {
  const aborting = new Recorder();
  const recording = new Recorder();

  const a = check.noTaskLeaks(aborting, "the handler cleans up");
  const timerA = setTimeout(() => undefined, 5000);
  a();
  clearTimeout(timerA);

  const b = soft.noTaskLeaks(recording, "the handler cleans up");
  const timerB = setTimeout(() => undefined, 5000);
  b();
  clearTimeout(timerB);

  expect(aborting.failed).toBe(true);
  expect(recording.message).toBe(aborting.message);
});
