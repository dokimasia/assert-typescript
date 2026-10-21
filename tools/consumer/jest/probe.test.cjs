// One passing and one failing call of a matcher in a consumer project.
const { expect, test } = require("@jest/globals");
const { check, Recorder } = require("@dokimi/assert");

test("passes a matcher of the standard", () => {
  expect([1, 2]).hasLength(2, "every item comes back");
});

test("fails a matcher of the standard with its sentence", () => {
  expect(() => expect(1).isEqualTo(2, "the values match")).toThrow(
    "the values match: want 2, got 1",
  );
});

test("loads the function form from the CommonJS build", () => {
  const seat = new Recorder();
  check.isEqualTo(seat, 1, 1, "the function form loads from the CommonJS build");
  expect(seat.failed).isFalse("the function form passes");
});
