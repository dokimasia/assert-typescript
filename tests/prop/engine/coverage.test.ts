/**
 * The spec of the coverage test. Each verdict is the verdict of the
 * definition's reference implementation on the same counts.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { CHECKS, type Verdict, verdict } from "../../../src/prop/engine/coverage.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

describe("coverage", () => {
  describe("CHECKS", () => {
    it("checks at each power of two up to 8 times the cases", ({ seat }) => {
      check.equal(seat, [...CHECKS], [1, 2, 4, 8], "the multiples of cases");
    });
  });

  describe("verdict", () => {
    const tests: {
      name: string;
      give: readonly [number, number, number, boolean, boolean];
      want: Verdict;
    }[] = [
      {
        name: "met for 27 of 100 against 10%",
        give: [27, 100, 0.1, false, false] as const,
        want: "met",
      },
      {
        name: "undecided for 26 of 100 against 10% before the last check",
        give: [26, 100, 0.1, false, false] as const,
        want: "undecided",
      },
      {
        name: "undecided for 10 of 100 against 10% before the last check",
        give: [10, 100, 0.1, false, false] as const,
        want: "undecided",
      },
      {
        name: "refuted for none of 100 against 50%",
        give: [0, 100, 0.5, false, false] as const,
        want: "refuted",
      },
      {
        name: "met for 75 of 800 against 10% at the last check",
        give: [75, 800, 0.1, true, false] as const,
        want: "met",
      },
      {
        name: "unmet for 70 of 800 against 10% at the last check",
        give: [70, 800, 0.1, true, false] as const,
        want: "unmet",
      },
      {
        name: "refuted for none of 800 against 50% at the last check",
        give: [0, 800, 0.5, true, false] as const,
        want: "refuted",
      },
      {
        name: "undecided for 6 of 6 against 100% from the interval",
        give: [6, 6, 1, false, false] as const,
        want: "undecided",
      },
      {
        name: "met for 9 of 10 against an exact 100%",
        give: [9, 10, 1, true, true] as const,
        want: "met",
      },
      {
        name: "met for one of six exact inputs against 10%",
        give: [1, 6, 0.1, false, true] as const,
        want: "met",
      },
      {
        name: "unmet for none of six exact inputs against 10%",
        give: [0, 6, 0.1, false, true] as const,
        want: "unmet",
      },
      {
        name: "met for six of six exact inputs against 100%",
        give: [6, 6, 1, false, true] as const,
        want: "met",
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, verdict(...tt.give), tt.want, "the verdict");
      });
    }

    const refusals = [
      { name: "no trials", give: [0, 0] as const },
      { name: "a negative count", give: [-1, 10] as const },
      { name: "more successes than trials", give: [11, 10] as const },
    ];
    for (const tt of refusals) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        const [k, n] = tt.give;

        check.equal(
          seat,
          thrown(() => verdict(k, n, 0.5, false, false)),
          `prop: ${k} of ${n} is no share`,
          "the refusal",
        );
      });
    }
  });
});
