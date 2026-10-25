"use strict";
// The matchers, expect.soft and the guard of unawaited matchers. The title
// of each test states the status that tests/jest.test.ts expects.
const { describe, expect, test } = require("@jest/globals");

/** Returns a promise that resolves after ms milliseconds. */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("matchers", () => {
  test("passes a call that passes", () => {
    expect([1, 2]).hasLength(2, "every item comes back");
  });

  test("fails a call that fails", () => {
    expect(1).isEqualTo(2, "the values match"); // the failing call
  });

  test("fails a call under .not", () => {
    expect(1).not.isEqualTo(2, "the values differ");
  });

  test("fails a call under resolves", async () => {
    await expect(Promise.resolve(1)).resolves.isEqualTo(2, "the reply is two");
  });

  test("passes the count of expect.assertions", () => {
    expect.assertions(2);
    expect(true).isTrue("the first holds");
    expect(false).isFalse("the second holds");
  });
});

describe("soft", () => {
  test("fails with two soft failures, and runs the call after them", () => {
    expect.soft(1).isEqualTo(2, "the first contract");
    expect.soft([1]).hasLength(2, "the second contract");
    expect(true).isTrue("the call after them");
  });

  test("fails with a thrown failure after a soft failure", () => {
    expect.soft(1).isEqualTo(2, "the soft contract");
    expect(1).isEqualTo(3, "the thrown contract");
  });

  test("fails with an awaited soft failure, and runs on", async () => {
    await expect.soft(() => delay(50)).completesWithin(1, "the work ends in time");
    expect(true).isTrue("the call after it");
  });

  test("fails a soft call under .not", () => {
    expect.soft(1).not.isEqualTo(2, "the values differ");
  });

  test("passes the count of expect.assertions with two soft calls that pass", () => {
    expect.assertions(2);
    expect.soft(1).isEqualTo(1, "the first holds");
    expect.soft(2).isEqualTo(2, "the second holds");
  });
});

describe("guard", () => {
  test("passes an awaited matcher that passes", async () => {
    await expect(() => Promise.reject(new Error("no"))).rejectsWith(
      "the call is refused",
    );
  });

  test("fails an awaited matcher that fails", async () => {
    await expect(() => Promise.resolve(1)).rejectsWith("the call is refused");
  });

  test("fails a matcher that is still running at the end", () => {
    void expect(() => delay(50)).completesWithin(1000, "the work ends in time");
  });

  test("passes the test after it", async () => {
    await delay(100);
  });

  test("passes an unawaited matcher that passed before the end", async () => {
    void expect(() => Promise.reject(new Error("no"))).rejectsWith(
      "the call is refused",
    );
    await delay(10);
  });
});

describe("concurrent", () => {
  test.concurrent("passes an unawaited matcher in a concurrent test", async () => {
    void expect(() => delay(50)).completesWithin(1000, "the work ends in time");
  });
});
