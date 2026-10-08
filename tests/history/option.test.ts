/** The spec of the options of a check of linearizability. */

import { describe } from "vitest";
import {
  BUDGET,
  budget,
  configure,
  MEMO_LIMIT,
  memoLimit,
  type Option,
  timeLimit,
  workers,
} from "../../src/history/option.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** The settings without an option. */
const DEFAULTS = { budget: 10_000_000, memoLimit: 2 ** 33, timeLimit: 0 };

/** An option: its export, a call that it accepts with the settings it states, and the calls that it refuses. */
interface Row {
  readonly name: string;
  readonly give: () => Option;
  readonly want: Partial<typeof DEFAULTS>;
  readonly refusals: readonly { name: string; give: () => Option; want: string }[];
}

const ROWS: readonly Row[] = [
  {
    name: "budget",
    give: () => budget(5),
    want: { budget: 5 },
    refusals: [
      {
        name: "0 steps",
        give: () => budget(0),
        want: "history: budget(0) is no integer of 1 or more",
      },
      {
        name: "a fraction of a step",
        give: () => budget(1.5),
        want: "history: budget(1.5) is no integer of 1 or more",
      },
    ],
  },
  {
    name: "memoLimit",
    give: () => memoLimit(64),
    want: { memoLimit: 64 },
    refusals: [
      {
        name: "0 bits",
        give: () => memoLimit(0),
        want: "history: memoLimit(0) is no integer of 1 or more",
      },
    ],
  },
  {
    name: "timeLimit",
    give: () => timeLimit(250),
    want: { timeLimit: 250 },
    refusals: [
      {
        name: "a negative time",
        give: () => timeLimit(-1),
        want: "history: timeLimit(-1) is no integer of 0 or more",
      },
      {
        name: "NaN",
        give: () => timeLimit(Number.NaN),
        want: "history: timeLimit(NaN) is no integer of 0 or more",
      },
    ],
  },
  {
    name: "workers",
    give: () => workers(4),
    want: {},
    refusals: [
      {
        name: "no worker",
        give: () => workers(0),
        want: "history: workers(0) is no integer of 1 or more",
      },
    ],
  },
];

describe("option", () => {
  describe("BUDGET", () => {
    it("allows 10,000,000 steps", ({ seat }) => {
      check.equal(seat, BUDGET, 10_000_000, "the budget");
    });
  });

  describe("MEMO_LIMIT", () => {
    it("allows 2^33 bits", ({ seat }) => {
      check.equal(seat, MEMO_LIMIT, 2 ** 33, "the memo limit");
    });
  });

  for (const row of ROWS) {
    describe(row.name, () => {
      it("returns an option that sets its setting alone", ({ seat }) => {
        check.equal(
          seat,
          configure([row.give()]),
          { ...DEFAULTS, ...row.want },
          "the settings",
        );
      });

      for (const tt of row.refusals) {
        it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
          check.equal(seat, thrown(tt.give), tt.want, "the refusal");
        });
      }
    });
  }

  describe("configure", () => {
    it("returns the defaults without an option", ({ seat }) => {
      check.equal(seat, configure([]), DEFAULTS, "the defaults");
    });

    it("lets a later option override an earlier one", ({ seat }) => {
      check.equal(
        seat,
        configure([budget(5), budget(7)]).budget,
        7,
        "the later budget",
      );
    });
  });
});
