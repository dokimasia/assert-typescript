// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the strategies of the task scheduler. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { IntegerBounds, UINT64_MAX } from "../../src/prop/engine/choice.js";
import {
  changePoints,
  pct,
  pick,
  priorityOf,
  uniform,
} from "../../src/stateful/strategy.js";
import { test as it } from "../../src/vitest.js";
import { bodyCase, replaying, thrown } from "../helpers.js";

/** The bounds of a priority and of the count of a change point. */
const WIDE = new IntegerBounds(0n, UINT64_MAX);

describe("strategy", () => {
  describe("uniform", () => {
    it("returns the strategy of depth 0", ({ seat }) => {
      check.isEqualTo(seat, uniform(), { depth: 0 }, "the uniform strategy");
    });
  });

  describe("pct", () => {
    it("returns the strategy of its depth", ({ seat }) => {
      check.isEqualTo(seat, pct(3), { depth: 3 }, "depth 3");
    });

    const tests: { name: string; give: number; want: string }[] = [
      { name: "0", give: 0, want: "stateful: pct(0) is no integer of 1 or more" },
      { name: "1.5", give: 1.5, want: "stateful: pct(1.5) is no integer of 1 or more" },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for the depth ${tt.name}`, ({ seat }) => {
        const err = check.doesThrow(seat, () => pct(tt.give), "a refusal");

        check.isEqualTo(
          seat,
          [err instanceof RangeError, thrown(() => pct(tt.give))],
          [true, tt.want],
          "the error",
        );
      });
    }
  });

  describe("priorityOf", () => {
    it("returns the priority that the case chooses under PCT", ({ seat }) => {
      const { c, engine } = bodyCase(replaying(7));

      check.isEqualTo(
        seat,
        [priorityOf(c, pct(2)), engine.requests.map((request) => request.bounds)],
        [7n, [WIDE]],
        "one choice of a priority",
      );
    });

    it("returns 0 without a choice under the uniform strategy", ({ seat }) => {
      const { c, engine } = bodyCase(replaying());

      check.isEqualTo(
        seat,
        [priorityOf(c, uniform()), engine.requests.length],
        [0n, 0],
        "no choice",
      );
    });
  });

  describe("changePoints", () => {
    it("returns the count of each present change point under PCT", ({ seat }) => {
      const { c } = bodyCase(replaying(1, 9, 0));

      check.isEqualTo(seat, changePoints(c, pct(3)), [9n], "one present point");
    });

    it("returns no change point without a choice under the uniform strategy", ({
      seat,
    }) => {
      const { c, engine } = bodyCase(replaying());

      check.isEqualTo(
        seat,
        [changePoints(c, uniform()), engine.requests.length],
        [[], 0],
        "no choice",
      );
    });
  });

  describe("pick", () => {
    it("returns the index that the case chooses under the uniform strategy", ({
      seat,
    }) => {
      const { c } = bodyCase(replaying(2));
      const ready = [0n, 0n, 0n].map((priority) => ({ level: 0, priority }));

      check.isEqualTo(seat, pick(c, uniform(), ready), 2, "the third task");
    });

    it("returns the task of the highest level and then the highest priority under PCT", ({
      seat,
    }) => {
      const { c } = bodyCase(replaying());
      const ready = [
        { level: -1, priority: 9n },
        { level: 0, priority: 3n },
        { level: 0, priority: 5n },
        { level: 0, priority: 5n },
      ];

      check.isEqualTo(
        seat,
        pick(c, pct(1), ready),
        2,
        "the earlier of the two tasks of priority 5 at level 0",
      );
    });
  });
});
