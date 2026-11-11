// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the memo of the configurations that the search of one partition visited. */

import { describe } from "vitest";
import { Memo } from "../../src/history/memo.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Reports whether two numeric states are equal. */
function same(a: number, b: number): boolean {
  return a === b;
}

describe("memo", () => {
  describe("Memo.visit", () => {
    it("stores a configuration that the memo lacks", ({ seat }) => {
      const memo = new Memo<number>(0n, 2, 100);

      check.isEqualTo(seat, memo.visit(0b01n, ["1"], [1], same), "stored", "stored");
    });

    it("covers a configuration of the same calls and states", ({ seat }) => {
      const memo = new Memo<number>(0n, 2, 100);
      memo.visit(0b01n, ["1"], [1], same);

      check.isEqualTo(seat, memo.visit(0b01n, ["1"], [1], same), "covered", "covered");
    });

    it("covers a configuration whose calls without a completion entry include those of the memo", ({
      seat,
    }) => {
      const memo = new Memo<number>(0b11n, 2, 100);
      memo.visit(0b01n, ["1"], [1], same);

      check.isEqualTo(seat, memo.visit(0b11n, ["1"], [1], same), "covered", "covered");
    });

    it("stores a configuration that lacks a call without a completion entry of the memo", ({
      seat,
    }) => {
      const memo = new Memo<number>(0b11n, 2, 100);
      memo.visit(0b11n, ["1"], [1], same);

      check.isEqualTo(seat, memo.visit(0b01n, ["1"], [1], same), "stored", "stored");
    });

    it("stores a configuration of other states", ({ seat }) => {
      const memo = new Memo<number>(0n, 2, 100);
      memo.visit(0b01n, ["1"], [1], same);

      check.isEqualTo(seat, memo.visit(0b01n, ["2"], [2], same), "stored", "stored");
    });

    it("stores a configuration of fewer states under the same keys", ({ seat }) => {
      const memo = new Memo<number>(0n, 2, 100);
      memo.visit(0b01n, ["k"], [1, 2], same);

      check.isEqualTo(seat, memo.visit(0b01n, ["k"], [1], same), "stored", "stored");
    });

    it("stores a configuration of other calls with a completion entry", ({ seat }) => {
      const memo = new Memo<number>(0n, 2, 100);
      memo.visit(0b01n, ["1"], [1], same);

      check.isEqualTo(seat, memo.visit(0b10n, ["1"], [1], same), "stored", "stored");
    });

    it("returns full for a configuration past the limit of its bits", ({ seat }) => {
      const memo = new Memo<number>(0n, 3, 5);

      check.isEqualTo(
        seat,
        [memo.visit(0b01n, ["1"], [1], same), memo.visit(0b10n, ["1"], [1], same)],
        ["stored", "full"],
        "the second configuration takes the memo past five bits",
      );
    });
  });
});
