/**
 * The value assertions, where the corpus cannot reach.
 *
 * The corpus states what each assertion means for values it can carry
 * as data. These are the paths it cannot: a type with no length, a
 * haystack that cannot be searched, a pattern that does not compile.
 * Each is reported like any other failure rather than thrown, which is
 * what keeps a wrong argument from ending a run with a stack trace.
 */

import { describe, expect, it } from "vitest";
import * as check from "../src/check.js";
import { equateEmpty, equateNans } from "../src/option.js";
import { Recorder } from "../src/seat.js";

/** Drive one call against a fresh recorder and answer what it said. */
function drive(call: (seat: Recorder) => void): Recorder {
  const seat = new Recorder();
  call(seat);
  return seat;
}

describe("a type with no length is reported", () => {
  const cases: [string, (s: Recorder) => void][] = [
    ["length", (s) => check.length(s, 42, 1, "it has a length")],
    ["isEmpty", (s) => check.isEmpty(s, 42, "it is empty")],
    ["isNotEmpty", (s) => check.isNotEmpty(s, 42, "it holds something")],
  ];

  for (const [name, call] of cases) {
    it(name, () => {
      const seat = drive(call);
      expect(seat.failed).toBe(true);
      expect(seat.failures[0]?.detail).toBeDefined();
    });
  }
});

describe("a non-text value is reported", () => {
  const cases: [string, (s: Recorder) => void][] = [
    ["hasPrefix", (s) => check.hasPrefix(s, 42, "4", "it starts with four")],
    ["hasSuffix", (s) => check.hasSuffix(s, 42, "2", "it ends with two")],
    ["matches", (s) => check.matches(s, 42, "\\d", "it is a digit")],
    ["containsInOrder", (s) => check.containsInOrder(s, 42, ["4"], "it holds four")],
  ];

  for (const [name, call] of cases) {
    it(name, () => {
      const seat = drive(call);
      expect(seat.failed).toBe(true);
      expect(seat.failures[0]?.detail).toBeDefined();
    });
  }
});

describe("a non-numeric value is reported", () => {
  const cases: [string, (s: Recorder) => void][] = [
    ["closeTo", (s) => check.closeTo(s, "1", 1, 0.5, "it is about one")],
    ["inRange", (s) => check.inRange(s, "5", 0, 10, "it is in range")],
  ];

  for (const [name, call] of cases) {
    it(name, () => {
      const seat = drive(call);
      expect(seat.failed).toBe(true);
      expect(seat.failures[0]?.detail).toBeDefined();
    });
  }
});

it("a pattern that does not compile is reported", () => {
  const seat = drive((s) => check.matches(s, "anything", "([unclosed", "it matches"));

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.detail["pattern"]).toBe("([unclosed");
});

it("a haystack that cannot be searched is reported", () => {
  const seat = drive((s) => check.contains(s, 42, 4, "it holds four"));

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.detail).toBeDefined();
});

it("a text haystack cannot answer for a non-text needle", () => {
  const seat = drive((s) => check.contains(s, "hello", 42, "it holds the answer"));

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.detail).toBeDefined();
});

it("an inverted range says so rather than reporting the value", () => {
  const seat = drive((s) => check.inRange(s, 5, 10, 1, "it is in range"));

  expect(seat.failures[0]?.detail["low"]).toBe(10);
  expect(seat.failures[0]?.detail["high"]).toBe(1);
});

it("NaN is outside every tolerance", () => {
  const seat = drive((s) =>
    check.closeTo(s, Number.NaN, 1, Number.POSITIVE_INFINITY, "it is about one"),
  );

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("NaN");
});

it("NaN is in no range", () => {
  const seat = drive((s) => check.inRange(s, Number.NaN, 0, 10, "it is in range"));

  expect(seat.failed).toBe(true);
});

it("a Map answers for its size and its keys", () => {
  const map = new Map([["a", 1]]);
  expect(drive((s) => check.length(s, map, 1, "it holds one")).failed).toBe(false);
  expect(drive((s) => check.contains(s, map, "a", "it holds a")).failed).toBe(false);
});

it("a Set answers for its size and its members", () => {
  const set = new Set([1, 2]);
  expect(drive((s) => check.length(s, set, 2, "it holds two")).failed).toBe(false);
  expect(drive((s) => check.contains(s, set, 2, "it holds two")).failed).toBe(false);
});

it("a plain object answers for its keys", () => {
  const seat = drive((s) =>
    check.contains(s, { etag: "x" }, "etag", "it is cacheable"),
  );

  expect(seat.failed).toBe(false);
});

it("equateEmpty makes an absent collection equal an empty one", () => {
  expect(drive((s) => check.equal(s, null, [], "no items")).failed).toBe(true);
  expect(drive((s) => check.equal(s, null, [], "no items", equateEmpty())).failed).toBe(
    false,
  );
});

it("equateNans makes NaN equal itself", () => {
  expect(drive((s) => check.equal(s, Number.NaN, Number.NaN, "same")).failed).toBe(
    true,
  );
  expect(
    drive((s) => check.equal(s, Number.NaN, Number.NaN, "same", equateNans())).failed,
  ).toBe(false);
});

it("undefined and null are both absent", () => {
  expect(drive((s) => check.isNil(s, undefined, "absent")).failed).toBe(false);
  expect(drive((s) => check.isNil(s, null, "absent")).failed).toBe(false);
  expect(drive((s) => check.isNotNil(s, undefined, "present")).failed).toBe(true);
});
