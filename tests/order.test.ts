/** The assertion about how neighbouring items relate. */

import { expect, it } from "vitest";
import * as check from "../src/check.js";
import { Recorder } from "../src/seat.js";

const ascending = (a: number, b: number) => a <= b;

it("passes a sequence that holds", () => {
  const seat = new Recorder();
  check.pairwise(seat, [1, 2, 2, 3], ascending, "the log is ordered");
  expect(seat.failed, seat.message).toBe(false);
});

it("reports the index where it broke", () => {
  const seat = new Recorder();
  check.pairwise(seat, [1, 3, 2], ascending, "the log is ordered");

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("index 1");
});

it("passes nought or one item, which have no pair", () => {
  for (const items of [[], [1]]) {
    const seat = new Recorder();
    check.pairwise(seat, items, ascending, "the log is ordered");
    expect(seat.failed).toBe(false);
  }
});

it("states uniqueness as a relation between neighbours", () => {
  const seat = new Recorder();
  check.pairwise(seat, [1, 1], (a, b) => a !== b, "no id repeats a neighbour");
  expect(seat.failed).toBe(true);
});
