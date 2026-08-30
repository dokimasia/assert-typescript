/**
 * The seats themselves.
 *
 * Written with bare `expect` rather than this library's assertions: a
 * seat tested through a seat proves nothing, because the thing under
 * test is the thing doing the reporting.
 */

import { expect, it } from "vitest";
import * as check from "../src/check.js";
import { AssertionFailed, Collector, Recorder, Standard } from "../src/seat.js";

it("a standard seat throws on a fatal failure", () => {
  expect(() => new Standard().fail("the stated contract")).toThrow(AssertionFailed);
});

it("a standard seat throws on a recorded failure too", () => {
  // It has no end of test to report at, so throwing early beats
  // dropping the failure entirely.
  expect(() => new Standard().record("the stated contract")).toThrow(AssertionFailed);
});

it("a recorder collects instead of throwing", () => {
  const seat = new Recorder();
  seat.fail("the first contract");
  seat.record("the second contract");

  expect(seat.failed).toBe(true);
  expect(seat.message).toBe("the first contract");
  expect(seat.messages).toEqual(["the second contract"]);
});

it("a recorder keeps the first fatal message", () => {
  const seat = new Recorder();
  seat.fail("the first");
  seat.fail("the second");

  expect(seat.message).toBe("the first");
});

it("a recorder that saw nothing answers an empty message", () => {
  expect(new Recorder().message).toBe("");
  expect(new Recorder().failed).toBe(false);
});

it("a recorder counts helper calls", () => {
  const seat = new Recorder();
  seat.helper();
  seat.helper();

  expect(seat.helperCalls).toBe(2);
});

it("a collector throws on a check and collects what soft records", () => {
  const seat = new Collector();
  seat.record("the first contract");
  seat.record("the second contract");

  expect(seat.collected).toHaveLength(2);
  expect(() => seat.fail("the fatal one")).toThrow(AssertionFailed);
});

it("a collector flushing nothing throws nothing", () => {
  expect(() => new Collector().flush()).not.toThrow();
});

it("a collector flushes one failure as itself", () => {
  const seat = new Collector();
  seat.record("the stated contract");

  expect(() => seat.flush()).toThrow("the stated contract");
});

it("a collector flushes several as a numbered list", () => {
  const seat = new Collector();
  seat.record("the first contract");
  seat.record("the second contract");

  expect(() => seat.flush()).toThrow(
    "2 failures:\n  1. the first contract\n  2. the second contract",
  );
});

it("a collector does not report the same failure twice", () => {
  const seat = new Collector();
  seat.record("the stated contract");

  expect(() => seat.flush()).toThrow();
  expect(() => seat.flush()).not.toThrow();
  expect(seat.collected).toEqual([]);
});

it("check throws on a collector and soft does not", () => {
  const seat = new Collector();
  expect(() => check.equal(seat, 1, 2, "it holds")).toThrow(AssertionFailed);
  expect(seat.collected).toEqual([]);
});
