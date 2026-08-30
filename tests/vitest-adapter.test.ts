/**
 * The Vitest adapter, driven as a consumer's suite would drive it.
 *
 * What is under test is what a failure looks like from outside: that
 * the fixture supplies a seat, that a recorded failure reaches the
 * test rather than the teardown, and that a forgotten await is caught.
 */

import { expect } from "vitest";
import * as check from "../src/check.js";
import * as soft from "../src/soft.js";
import { test } from "../src/vitest.js";

test("the fixture supplies a seat", ({ seat }) => {
  check.equal(seat, 1, 1, "it holds");
  expect(seat.collected).toEqual([]);
});

test("soft collects on the fixture's seat", ({ seat }) => {
  soft.equal(seat, 1, 2, "the first contract");
  soft.equal(seat, 3, 4, "the second contract");

  expect(seat.collected).toHaveLength(2);
  // Clear them, or the fixture would fail this test at the end.
  expect(() => seat.flush()).toThrow("2 failures:");
});

test("check throws on the fixture's seat", ({ seat }) => {
  expect(() => check.equal(seat, 1, 2, "it holds")).toThrow("want 2, got 1");
});

test("a passing test leaves the seat empty", ({ seat }) => {
  check.isNotNil(seat, {}, "it exists");
  soft.contains(seat, [1, 2], 1, "it is there");

  expect(seat.collected).toEqual([]);
});
