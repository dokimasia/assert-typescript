/** The spec of forAll, the assertion that a body passes for every case that a run generates. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import type { Case } from "../../src/prop/case.js";
import { SEED_VARIABLE } from "../../src/prop/environment.js";
import { forAll } from "../../src/prop/forall.js";
import { integer } from "../../src/prop/generators.js";
import { hermetic, seed, store } from "../../src/prop/option.js";
import { AssertionFailed, Recorder, Standard } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { records, setVariable, thrown } from "../helpers.js";

/** A body that fails for a digit of 5 or more. */
function belowFive(c: Case): void {
  check.isTrue(c, c.draw(integer(0, 9), "x") < 5, "x is below 5");
}

describe("forall", () => {
  describe("forAll", () => {
    it("passes a body that passes every case on the test's seat", async ({ seat }) => {
      await forAll(
        seat,
        "every digit is a digit",
        (c) => {
          check.inRange(c, c.draw(integer(0, 9), "x"), 0, 9, "x is a digit");
        },
        hermetic(),
        seed(1n),
        store(""),
      );
    });

    it("fails with one record of prop-for-all at the call of forAll", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await forAll(recorder, "every digit is below 5", belowFive, hermetic(), seed(1n));
      const [failure] = recorder.failures;

      check.equal(
        seat,
        [
          recorder.failures.length,
          failure?.assertion,
          failure?.contract,
          failure?.caseFailure?.assertion,
        ],
        [1, "prop-for-all", "every digit is below 5", "true"],
        "the record of the run, with the case's failure",
      );
      check.hasSuffix(
        seat,
        failure?.where?.file,
        "forall.test.ts",
        "the location is the call of forAll",
      );
    });

    it("awaits each case of an async body", async ({ seat }) => {
      const recorder = new Recorder();
      let settled = 0;
      await forAll(
        recorder,
        "an async body is awaited",
        async (c) => {
          c.draw(integer(0, 9), "x");
          await Promise.resolve();
          settled += 1;
        },
        hermetic(),
        seed(1n),
      );

      check.equal(
        seat,
        (records(recorder)[0]?.["detail"] as { cases: number } | undefined)?.cases,
        settled,
        "the record counts every case that settled",
      );
    });

    it("ends the call with a fault for a seed variable that is no number", async ({
      seat,
    }) => {
      setVariable(SEED_VARIABLE, "abc");
      const recorder = new Recorder();
      await forAll(recorder, "c", belowFive);

      check.equal(
        seat,
        recorder.message,
        'prop.forAll: DOKIMI_ASSERT_PROP_SEED: "abc" is no decimal number below 2^64',
        "the fault",
      );
    });

    it("rejects with the record's sentence on a seat that stops", async ({ seat }) => {
      const err = await check.rejectsWith(
        seat,
        () =>
          forAll(
            new Standard(),
            "every digit is below 5",
            belowFive,
            hermetic(),
            seed(1n),
          ),
        "the run stops the test",
      );

      check.isTrue(seat, err instanceof AssertionFailed, "the seat's failure");
      check.hasPrefix(
        seat,
        (err as Error).message,
        "every digit is below 5: counterexample after ",
        "the sentence of the run",
      );
    });

    it("reports a call that nobody awaited when the seat ends the test", async ({
      seat,
    }) => {
      const standard = new Standard();
      const dropped = forAll(
        standard,
        "a dropped property",
        belowFive,
        hermetic(),
        seed(1n),
      );
      const message = thrown(() => standard.flush());
      await dropped.catch(() => undefined);

      check.equal(
        seat,
        message,
        "1 assertion(s) were never awaited, so they asserted nothing:\n  - a dropped property\nAdd `await` to the call.",
        "the dropped call",
      );
    });
  });
});
