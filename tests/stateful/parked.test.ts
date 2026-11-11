// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the parked tasks of a scheduler. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Parked } from "../../src/stateful/parked.js";
import { test as it } from "../../src/vitest.js";

describe("parked", () => {
  describe("Parked.wake", () => {
    it("returns the tasks whose deadlines have passed, by deadline and then in the order of their sleeps", ({
      seat,
    }) => {
      const parked = new Parked<string>();
      parked.sleep("c", 6n);
      parked.sleep("a", 2n);
      parked.sleep("b", 6n);
      parked.sleep("d", 9n);

      check.isEqualTo(
        seat,
        [parked.wake(6n), parked.wake(9n)],
        [["a", "c", "b"], ["d"]],
        "c slept before b, and d wakes at 9",
      );
    });

    it("returns the waiting tasks whose conditions return true after the sleeping tasks", ({
      seat,
    }) => {
      const parked = new Parked<string>();
      parked.wait("w", () => true);
      parked.sleep("s", 1n);
      parked.wait("v", () => false);
      parked.wait("u", () => true);

      check.isEqualTo(
        seat,
        [parked.wake(1n), parked.wake(1n)],
        [["s", "w", "u"], []],
        "v stays parked",
      );
    });

    it("calls each condition once", ({ seat }) => {
      const parked = new Parked<string>();
      let calls = 0;
      parked.wait("w", () => {
        calls += 1;
        return false;
      });
      parked.wake(0n);

      check.isEqualTo(seat, calls, 1, "one call");
    });

    it("throws what a condition throws", ({ seat }) => {
      const parked = new Parked<string>();
      const broken = new Error("broken");
      parked.wait("w", () => {
        throw broken;
      });

      check.isEqualTo(
        seat,
        check.doesThrow(seat, () => parked.wake(0n), "the wake throws"),
        broken,
        "the error of the condition",
      );
    });
  });

  describe("Parked.earliest", () => {
    it("returns the earliest deadline of a sleeping task", ({ seat }) => {
      const parked = new Parked<string>();
      parked.sleep("a", 5n);
      parked.sleep("b", 3n);
      parked.sleep("c", 7n);

      check.isEqualTo(seat, parked.earliest(10n), 3n, "the deadline of b");
    });

    it("returns the end when no deadline is earlier", ({ seat }) => {
      const parked = new Parked<string>();
      parked.sleep("a", 12n);

      check.isEqualTo(
        seat,
        [parked.earliest(10n), new Parked<string>().earliest(10n)],
        [10n, 10n],
        "the end of a later deadline and of no deadline",
      );
    });
  });

  describe("Parked.clear", () => {
    it("ends every parked task", ({ seat }) => {
      const parked = new Parked<string>();
      parked.wait("w", () => true);
      parked.sleep("s", 1n);
      parked.clear();

      check.isEmpty(seat, parked.wake(2n), "no task wakes");
    });
  });
});
