/**
 * The branches the ordinary tests do not reach.
 *
 * Each of these is a path that only opens for an unusual input: a
 * thrown value that is not an Error, a benchmark with enough samples
 * for a real percentile, a comparison deep enough to stop. They are
 * cheap to get wrong and invisible until they matter.
 */

import { expect, it } from "vitest";
import { Contract } from "../src/bench.js";
import * as check from "../src/check.js";
import type { Case } from "../src/conformance/corpus.js";
import { mismatch } from "../src/conformance/corpus.js";
import { equal } from "../src/matcher/compare.js";
import { settings } from "../src/matcher/option.js";
import { Recorder } from "../src/seat.js";

const STRICT = settings([]);
const RELAXED = settings([{ kind: "equate-empty" }]);

it("a subject that rejects with something that is not an Error", async () => {
  const seat = new Recorder();
  await check.honoursCancellation(
    seat,
    () => Promise.reject("a bare string"),
    "it stops when told",
  );

  // Not a cancellation, so it is a failure rather than a pass.
  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("a bare string");
});

it("a subject that rejects with an unrelated error under a deadline", async () => {
  const seat = new Recorder();
  await check.honoursDeadline(
    seat,
    () => Promise.reject(new TypeError("unrelated")),
    "it respects its deadline",
  );

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("TypeError");
});

it("a subject that throws something other than a TypeError on no handle", async () => {
  const seat = new Recorder();
  await check.nullHandleSafe(
    seat,
    () => {
      throw new RangeError("a handle is required");
    },
    "a missing handle is not fatal",
  );

  // Refusing with an error of its own is the right answer, not a crash.
  expect(seat.failed, seat.message).toBe(false);
});

it("equateEmpty answers for a Map and a Set as well as an array", () => {
  expect(equal(null, new Map(), RELAXED)).toBe(true);
  expect(equal(null, new Set(), RELAXED)).toBe(true);
  expect(equal(null, {}, RELAXED)).toBe(true);
  expect(equal(null, new Map([["a", 1]]), RELAXED)).toBe(false);
});

it("equateEmpty answers whichever side is absent", () => {
  expect(equal([], null, RELAXED)).toBe(true);
  expect(equal([], undefined, RELAXED)).toBe(true);
});

it("a comparison deeper than the limit stops rather than overflowing", () => {
  const deep = (n: number): unknown => (n === 0 ? 1 : { next: deep(n - 1) });

  expect(() => equal(deep(200), deep(200), STRICT)).not.toThrow();
  expect(equal(deep(200), deep(200), STRICT)).toBe(true);
});

it("a p99 over a hundred samples is a percentile, not the slowest", async () => {
  const seat = new Recorder();
  const contract = new Contract(seat, "get stays quick").maxLatency(1000);

  await contract.loop(120, () => undefined);
  contract.check();

  expect(seat.failed, seat.message).toBe(false);
});

it("a length assertion answers for a plain object", () => {
  const seat = new Recorder();
  check.length(seat, { a: 1, b: 2 }, 2, "it holds two entries");

  expect(seat.failed, seat.message).toBe(false);
});

it("the corpus checker names what went wrong", () => {
  const passing: Case = {
    id: "x/y",
    assertion: "equal",
    args: [],
    expect: "pass",
    messageContains: [],
    skip: {},
  };
  const failed = new Recorder();
  failed.fail("it broke");

  expect(mismatch(passing, failed)).toContain("expected a pass");
  expect(mismatch({ ...passing, expect: "fail" }, new Recorder())).toContain(
    "expected a failure",
  );
  expect(
    mismatch({ ...passing, expect: "fail", messageContains: ["absent"] }, failed),
  ).toContain("does not mention");
  expect(mismatch(passing, new Recorder())).toBeUndefined();
});
