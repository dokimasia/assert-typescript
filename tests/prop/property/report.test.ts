// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the verdict of a property's call. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Running } from "../../../src/matcher/verdict.js";
import { FOR_ALL } from "../../../src/prop/detail.js";
import { type Outcome, Tally } from "../../../src/prop/engine/tally.js";
import { adapt } from "../../../src/prop/property/body.js";
import { reportOutcome } from "../../../src/prop/property/report.js";
import type { Call } from "../../../src/prop/property.js";
import { Recorder } from "../../../src/seat.js";
import { test as it } from "../../../src/vitest.js";
import { executed, records } from "../../helpers.js";

/** The call site of the property. */
const WHERE = { file: "/work/tests/total.test.ts", line: 3 };

/** The call of the property of this spec. */
const CALL: Call = {
  op: "prop.forAll",
  assertion: FOR_ALL,
  contract: "c",
  where: WHERE,
};

/** Reports outcome on a new recorder and returns the recorder with its call record. */
function reported(outcome: Outcome): [Recorder, Record<string, unknown> | undefined] {
  const recorder = new Recorder();
  reportOutcome(Running.begin(recorder, WHERE), CALL, outcome);
  return [recorder, records(recorder)[0]];
}

describe("report", () => {
  describe("reportOutcome", () => {
    it("records a pass of a run that passed", ({ seat }) => {
      const [recorder, call] = reported(new Tally(1n).outcome("passed"));

      check.isEqualTo(
        seat,
        [recorder.failures, call?.["verdict"]],
        [[], "pass"],
        "a pass",
      );
    });

    it("records a skip with its reason", ({ seat }) => {
      const [recorder, call] = reported(
        new Tally(1n).outcome("skipped", {
          reason: "the environment lacks a capability",
        }),
      );
      const detail = call?.["detail"] as Record<string, unknown> | undefined;

      check.isEqualTo(
        seat,
        [recorder.failed, call?.["verdict"], detail?.["reason"]],
        [false, "skip", "the environment lacks a capability"],
        "a skip",
      );
    });

    it("fails with a record of the call's assertion for a counterexample", async ({
      seat,
    }) => {
      const failing = await executed(
        adapt(
          new Recorder(),
          undefined,
          (c) => check.isTrue(c, false, "x is below 5"),
          CALL,
          undefined,
        ),
        [],
      );
      const [recorder] = reported(new Tally(1n).take(failing) as Outcome);
      const [failure] = recorder.failures;

      check.isEqualTo(
        seat,
        [failure?.assertion, failure?.contract, failure?.caseFailure?.assertion],
        [FOR_ALL, "c", "true"],
        "the record of the property",
      );
    });
  });
});
