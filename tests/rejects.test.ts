/** The assertion that an assertion can fail. */

import { expect, it } from "vitest";
import * as check from "../src/check.js";
import { AssertionFailed, Recorder, Standard } from "../src/seat.js";

it("passes when the body fails, and answers what it said", () => {
  const seat = new Recorder();
  const failure = check.rejects(seat, "an empty name is refused", (inner) => {
    check.isNil(inner, "not empty", "it passes");
  });

  expect(seat.failed, seat.message).toBe(false);
  expect(failure).toContain("it passes");
});

it("reports when the body passes", () => {
  const seat = new Recorder();
  check.rejects(seat, "an empty name is refused", (inner) => {
    check.isNil(inner, null, "it passes");
  });

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("reported no failure");
});

it("stops the test on a standard seat", () => {
  expect(() =>
    check.rejects(new Standard(), "it is refused", (inner) => {
      check.isNil(inner, null, "it passes");
    }),
  ).toThrow(AssertionFailed);
});

it("hands the body a seat that records rather than throwing", () => {
  const seat = new Recorder();
  check.rejects(seat, "several failures are collected", (inner) => {
    check.isNil(inner, 1, "the first");
    check.isNil(inner, 2, "the second");
    expect(inner.failed).toBe(true);
  });
});
