/** The spec of the strategies of the task scheduler. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { pct, uniform } from "../../src/stateful/strategy.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

describe("strategy", () => {
  describe("uniform", () => {
    it("returns the strategy of depth 0", ({ seat }) => {
      check.equal(seat, uniform(), { depth: 0 }, "the uniform strategy");
    });
  });

  describe("pct", () => {
    it("returns the strategy of its depth", ({ seat }) => {
      check.equal(seat, pct(3), { depth: 3 }, "depth 3");
    });

    const tests: { name: string; give: number; want: string }[] = [
      { name: "0", give: 0, want: "stateful: pct(0) is no integer of 1 or more" },
      { name: "1.5", give: 1.5, want: "stateful: pct(1.5) is no integer of 1 or more" },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for the depth ${tt.name}`, ({ seat }) => {
        const err = check.throws(seat, () => pct(tt.give), "a refusal");

        check.equal(
          seat,
          [err instanceof RangeError, thrown(() => pct(tt.give))],
          [true, tt.want],
          "the error",
        );
      });
    }
  });
});
