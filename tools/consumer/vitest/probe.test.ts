// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

// One passing and one failing call of a matcher in a consumer project.
import { expect, it } from "vitest";

it("passes a matcher of the standard", () => {
  expect([1, 2]).hasLength(2, "every item comes back");
});

it("fails a matcher of the standard with its sentence", () => {
  expect(() => expect(1).isEqualTo(2, "the values match")).toThrow(
    "the values match: want 2, got 1",
  );
});
