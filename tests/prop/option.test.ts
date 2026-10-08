/** The spec of the options of a property. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { integer } from "../../src/prop/generators.js";
import {
  cases,
  configure,
  draws,
  example,
  examples,
  explain,
  hermetic,
  maxChoices,
  replay,
  require,
  seed,
  shrink,
  shrinkTime,
  store,
  using,
  workers,
} from "../../src/prop/option.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

describe("option", () => {
  describe("cases", () => {
    it("returns the option of the number of valid cases", ({ seat }) => {
      check.equal(
        seat,
        cases(5),
        { kind: "cases", value: 5 },
        "the option states 5 cases",
      );
    });

    it("throws a RangeError for a number below 1", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => cases(0)),
        "prop: cases(0) states no whole number of 1 or more",
        "cases refuses 0",
      );
    });

    it("throws a RangeError for a number that is no whole number", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => cases(1.5)),
        "prop: cases(1.5) states no whole number of 1 or more",
        "cases refuses a fraction",
      );
    });
  });

  describe("seed", () => {
    it("returns the option of a seed stated as a bigint", ({ seat }) => {
      check.equal(
        seat,
        seed(2n ** 64n - 1n),
        { kind: "seed", value: 2n ** 64n - 1n },
        "the largest seed",
      );
    });

    it("returns the option of a seed stated as a safe integer", ({ seat }) => {
      check.equal(seat, seed(7), { kind: "seed", value: 7n }, "the seed 7");
    });

    it("throws a RangeError for a seed of 2^64", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => seed(2n ** 64n)),
        "prop: seed(18446744073709551616) states no integer in [0, 2^64)",
        "seed refuses 2^64",
      );
    });

    it("throws a RangeError for a negative seed", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => seed(-1n)),
        "prop: seed(-1) states no integer in [0, 2^64)",
        "seed refuses -1",
      );
    });

    it("throws a RangeError for a number that is no safe integer", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => seed(0.5)),
        "prop: seed(0.5) states no integer in [0, 2^64)",
        "seed refuses a fraction",
      );
    });
  });

  describe("replay", () => {
    it("returns the option of the token to replay", ({ seat }) => {
      check.equal(
        seat,
        replay("prop1:AA"),
        { kind: "replay", value: "prop1:AA" },
        "the token",
      );
    });
  });

  describe("require", () => {
    it("returns the option of a coverage requirement", ({ seat }) => {
      check.equal(
        seat,
        require("even", 0.25),
        { kind: "require", value: { label: "even", share: 0.25 } },
        "the requirement",
      );
    });

    it("throws a RangeError for a share above 1", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => require("even", 1.5)),
        'prop: require("even", 1.5) states a share outside [0, 1]',
        "require refuses 1.5",
      );
    });

    it("throws a RangeError for a share of NaN", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => require("even", Number.NaN)),
        'prop: require("even", NaN) states a share outside [0, 1]',
        "require refuses NaN",
      );
    });
  });

  describe("shrink", () => {
    it("returns an option of a budget of 0 that turns shrinking off", ({ seat }) => {
      check.equal(seat, shrink(0), { kind: "shrink", value: 0 }, "the budget 0");
    });

    it("throws a RangeError for a negative budget", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => shrink(-1)),
        "prop: shrink(-1) states no whole number of 0 or more",
        "shrink refuses -1",
      );
    });
  });

  describe("shrinkTime", () => {
    it("returns the option of the time that shrinking may take", ({ seat }) => {
      check.equal(seat, shrinkTime(250), { kind: "shrink-time", value: 250 }, "250 ms");
    });

    it("throws a RangeError for a negative time", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => shrinkTime(-1)),
        "prop: shrinkTime(-1) states no time of 0 or more",
        "shrinkTime refuses -1",
      );
    });

    it("throws a RangeError for an infinite time", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => shrinkTime(Number.POSITIVE_INFINITY)),
        "prop: shrinkTime(Infinity) states no time of 0 or more",
        "shrinkTime refuses Infinity",
      );
    });
  });

  describe("maxChoices", () => {
    it("returns the option of the cap on choices", ({ seat }) => {
      check.equal(
        seat,
        maxChoices(64),
        { kind: "max-choices", value: 64 },
        "the cap 64",
      );
    });

    it("throws a RangeError for a cap below 1", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => maxChoices(0)),
        "prop: maxChoices(0) states no whole number of 1 or more",
        "maxChoices refuses 0",
      );
    });
  });

  describe("store", () => {
    it("returns the option of the store's directory", ({ seat }) => {
      check.equal(seat, store(""), { kind: "store", value: "" }, "the empty directory");
    });
  });

  describe("explain", () => {
    it("returns the option that turns the explanation off", ({ seat }) => {
      check.equal(
        seat,
        explain(false),
        { kind: "explain", value: false },
        "no explanation",
      );
    });
  });

  describe("workers", () => {
    it("returns the option of the number of workers", ({ seat }) => {
      check.equal(seat, workers(4), { kind: "workers", value: 4 }, "four workers");
    });

    it("throws a RangeError for a number below 1", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => workers(0)),
        "prop: workers(0) states no whole number of 1 or more",
        "workers refuses 0",
      );
    });
  });

  describe("hermetic", () => {
    it("returns the option that reads none of the variables", ({ seat }) => {
      check.equal(seat, hermetic(), { kind: "hermetic" }, "the hermetic option");
    });
  });

  describe("draws", () => {
    it("returns the option of the entries of a case", ({ seat }) => {
      check.equal(seat, draws("[]"), { kind: "draws", value: "[]" }, "no entry");
    });
  });

  describe("using", () => {
    it("returns the option of the generator of a form's input", ({ seat }) => {
      const generator = integer(0, 9);

      check.equal(
        seat,
        using(generator),
        { kind: "using", value: generator },
        "the generator",
      );
    });
  });

  describe("example", () => {
    it("returns the option of the values of one case", ({ seat }) => {
      check.equal(
        seat,
        example(1, 2),
        { kind: "example", value: [1, 2] },
        "a case of two values",
      );
    });
  });

  describe("examples", () => {
    it("returns the option of one case per value", ({ seat }) => {
      check.equal(
        seat,
        examples(1, 2),
        { kind: "examples", value: [1, 2] },
        "two cases",
      );
    });
  });

  describe("configure", () => {
    it("returns the defaults for no option", ({ seat }) => {
      check.equal(
        seat,
        configure([]),
        {
          cases: 100,
          seed: undefined,
          replay: undefined,
          requirements: [],
          shrink: 2000,
          shrinkTime: 30_000,
          maxChoices: 8192,
          store: undefined,
          explain: true,
          hermetic: false,
          draws: undefined,
        },
        "the defaults",
      );
    });

    it("returns the setting of every option", ({ seat }) => {
      check.equal(
        seat,
        configure([
          cases(5),
          seed(9n),
          replay("prop1:AA"),
          require("a", 0.5),
          require("b", 0.25),
          shrink(10),
          shrinkTime(20),
          maxChoices(30),
          store("dir"),
          explain(false),
          workers(2),
          hermetic(),
          draws("[]"),
        ]),
        {
          cases: 5,
          seed: 9n,
          replay: "prop1:AA",
          requirements: [
            { label: "a", share: 0.5 },
            { label: "b", share: 0.25 },
          ],
          shrink: 10,
          shrinkTime: 20,
          maxChoices: 30,
          store: "dir",
          explain: false,
          hermetic: true,
          draws: "[]",
        },
        "each setting, with the requirements in order and the workers ignored",
      );
    });

    it("returns the setting of the later of two options of one kind", ({ seat }) => {
      check.equal(
        seat,
        configure([cases(5), cases(6)]).cases,
        6,
        "the later option overrides the earlier",
      );
    });
  });
});
