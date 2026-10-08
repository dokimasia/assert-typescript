/** The spec of the environment variables of the property engine. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { mix } from "../../src/prop/engine/source.js";
import {
  BUDGET_VARIABLE,
  budgetOf,
  mutated,
  PROFILE_VARIABLE,
  profileOf,
  REPLAY_VARIABLE,
  SEED_VARIABLE,
  seedOf,
  tokenOf,
} from "../../src/prop/environment.js";
import { test as it } from "../../src/vitest.js";
import { setVariable, thrown } from "../helpers.js";

/** The variable that a mutation run sets in every process that it instruments. */
const MUTANT = "DOKIMI_MUTATE_MUTANT";

/** The seed that a contract derives. */
const DERIVED = mix(Buffer.from("a contract", "utf8"));

describe("environment", () => {
  describe("mutated", () => {
    it("returns false in a process of no mutation run", ({ seat }) => {
      setVariable(MUTANT, undefined);

      check.isFalse(seat, mutated(), "the process is not mutated");
    });

    it("returns true when the environment contains the mutant variable with any value", ({
      seat,
    }) => {
      setVariable(MUTANT, "");

      check.isTrue(seat, mutated(), "the process is mutated");
    });
  });

  describe("profileOf", () => {
    it("returns default for an unset variable", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, undefined);

      check.equal(seat, profileOf(), "default", "the default profile");
    });

    it("returns default for an empty variable", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, "");

      check.equal(seat, profileOf(), "default", "the default profile");
    });

    it("returns the profile that the variable names", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, "campaign");

      check.equal(seat, profileOf(), "campaign", "the campaign profile");
    });

    it("throws a fault at the variable for an unknown profile", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, "fast");

      check.equal(
        seat,
        thrown(() => profileOf()),
        'DOKIMI_ASSERT_PROP_PROFILE: "fast" names none of the default, ci and campaign profiles',
        "the fault names the variable",
      );
    });
  });

  describe("seedOf", () => {
    it("returns the stated seed over the variable", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, undefined);
      setVariable(SEED_VARIABLE, "5");

      check.equal(seat, seedOf("a contract", 9n, false), 9n, "the stated seed");
    });

    it("returns the seed that the variable states", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, undefined);
      setVariable(SEED_VARIABLE, "18446744073709551615");

      check.equal(
        seat,
        seedOf("a contract", undefined, false),
        2n ** 64n - 1n,
        "the largest seed",
      );
    });

    it("throws a fault at the variable for a seed that is no decimal number", ({
      seat,
    }) => {
      setVariable(PROFILE_VARIABLE, undefined);
      setVariable(SEED_VARIABLE, "0x10");

      check.equal(
        seat,
        thrown(() => seedOf("a contract", undefined, false)),
        'DOKIMI_ASSERT_PROP_SEED: "0x10" is no decimal number below 2^64',
        "the fault names the variable",
      );
    });

    it("throws a fault at the variable for a seed of 2^64", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, undefined);
      setVariable(SEED_VARIABLE, "18446744073709551616");

      check.equal(
        seat,
        thrown(() => seedOf("a contract", undefined, false)),
        'DOKIMI_ASSERT_PROP_SEED: "18446744073709551616" is no decimal number below 2^64',
        "the fault names the variable",
      );
    });

    it("derives the seed from the contract under the ci profile", ({ seat }) => {
      setVariable(SEED_VARIABLE, undefined);
      setVariable(PROFILE_VARIABLE, "ci");

      check.equal(
        seat,
        seedOf("a contract", undefined, false),
        DERIVED,
        "the contract's seed",
      );
    });

    it("derives the seed from the contract in a process of a mutation run", ({
      seat,
    }) => {
      setVariable(SEED_VARIABLE, undefined);
      setVariable(MUTANT, "1");

      check.equal(
        seat,
        seedOf("a contract", undefined, true),
        DERIVED,
        "the contract's seed",
      );
    });

    it("ignores the variables in a hermetic run", ({ seat }) => {
      setVariable(SEED_VARIABLE, "0x10");
      setVariable(PROFILE_VARIABLE, "fast");
      setVariable(MUTANT, undefined);

      const drawn = seedOf("a contract", undefined, true);

      check.inRange(seat, Number(drawn), 0, 2 ** 64, "a random seed of 64 bits");
    });

    it("throws the fault of a misspelled profile in a run with a stated seed", ({
      seat,
    }) => {
      setVariable(PROFILE_VARIABLE, "fast");

      check.equal(
        seat,
        thrown(() => seedOf("a contract", 9n, false)),
        'DOKIMI_ASSERT_PROP_PROFILE: "fast" names none of the default, ci and campaign profiles',
        "the profile is checked first",
      );
    });
  });

  describe("budgetOf", () => {
    it("returns the budget in milliseconds under the campaign profile", ({ seat }) => {
      setVariable(MUTANT, undefined);
      setVariable(PROFILE_VARIABLE, "campaign");
      setVariable(BUDGET_VARIABLE, "5");

      check.equal(seat, budgetOf(false), 5000, "five seconds");
    });

    it("returns 0 under the default profile", ({ seat }) => {
      setVariable(MUTANT, undefined);
      setVariable(PROFILE_VARIABLE, undefined);
      setVariable(BUDGET_VARIABLE, "5");

      check.equal(seat, budgetOf(false), 0, "no campaign");
    });

    it("returns 0 for a hermetic run", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, "campaign");

      check.equal(seat, budgetOf(true), 0, "no campaign");
    });

    it("returns 0 in a process of a mutation run", ({ seat }) => {
      setVariable(MUTANT, "1");
      setVariable(PROFILE_VARIABLE, "campaign");

      check.equal(seat, budgetOf(false), 0, "no campaign");
    });

    const tests = [
      { name: "an unset budget", give: undefined },
      { name: "a budget of 0", give: "0" },
      { name: "a budget of 2^33 seconds", give: "8589934592" },
      { name: "a budget with a fraction", give: "1.5" },
    ];
    for (const tt of tests) {
      it(`throws a fault at the variable for ${tt.name}`, ({ seat }) => {
        setVariable(MUTANT, undefined);
        setVariable(PROFILE_VARIABLE, "campaign");
        setVariable(BUDGET_VARIABLE, tt.give);

        check.equal(
          seat,
          thrown(() => budgetOf(false)),
          `DOKIMI_ASSERT_PROP_BUDGET: ${JSON.stringify(tt.give ?? "")} is no whole number of seconds above 0`,
          "the fault names the variable",
        );
      });
    }
  });

  describe("tokenOf", () => {
    it("returns the stated token with the option as its source", ({ seat }) => {
      setVariable(REPLAY_VARIABLE, "prop1:AB");

      check.equal(
        seat,
        tokenOf("prop1:AA", false),
        { token: "prop1:AA", source: "replay" },
        "the option",
      );
    });

    it("returns the token of the variable with the variable as its source", ({
      seat,
    }) => {
      setVariable(REPLAY_VARIABLE, "prop1:AB");

      check.equal(
        seat,
        tokenOf(undefined, false),
        { token: "prop1:AB", source: REPLAY_VARIABLE },
        "the variable",
      );
    });

    it("returns undefined for a hermetic run without a stated token", ({ seat }) => {
      setVariable(REPLAY_VARIABLE, "prop1:AB");

      check.isNil(seat, tokenOf(undefined, true), "a hermetic run replays nothing");
    });

    it("returns undefined for an empty variable", ({ seat }) => {
      setVariable(REPLAY_VARIABLE, "");

      check.isNil(seat, tokenOf(undefined, false), "an empty variable states nothing");
    });
  });
});
