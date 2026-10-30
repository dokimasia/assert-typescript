// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the record of a property's run. */

import { describe } from "vitest";
import { Failure } from "../../src/failure.js";
import { check } from "../../src/index.js";
import { detailOf, FOR_ALL, recordOf, resultOf } from "../../src/prop/detail.js";
import { Replaying } from "../../src/prop/engine/case/providers.js";
import { Failed } from "../../src/prop/engine/case/signals.js";
import { Case } from "../../src/prop/engine/case.js";
import {
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../src/prop/engine/choice.js";
import type { Divergence, Execution } from "../../src/prop/engine/execution.js";
import type { Outcome } from "../../src/prop/engine/tally.js";
import { encode } from "../../src/prop/engine/token.js";
import { integer } from "../../src/prop/generators.js";
import { keyOf, ofRecord } from "../../src/prop/identity.js";
import { test as it } from "../../src/vitest.js";

/** The location of the failures. */
const WHERE = { file: "/work/tests/total.test.ts", line: 9 };

/** The record of the failing cases. */
const RECORD = new Failure("equal", "the totals agree", { want: 1, got: 2 }, WHERE);

/** Returns a failed execution of one draw of x from the integer choice value, and the steps and notes of fill. */
function failing(value: bigint, fill: (c: Case) => void = () => undefined): Execution {
  const c = new Case(new Replaying([{ kind: "integer", value }]));
  c.draw(integer(0, 9), "x");
  fill(c);
  const identity = ofRecord(RECORD);
  return {
    case: c,
    status: "failed",
    failure: new Failed(keyOf(identity), { failure: RECORD, identity }),
  };
}

/** Returns an outcome of kind with the counts 3 and 1 and the seed 7, and parts. */
function outcome(kind: Outcome["kind"], parts: Partial<Outcome> = {}): Outcome {
  return {
    kind,
    cases: 3,
    rejected: 1,
    seed: 7n,
    others: [],
    explanation: [],
    runs: 0,
    valued: false,
    stored: [],
    ...parts,
  };
}

/** A counterexample of x = 5 whose explanation states the nearest passing value 4, with another failure of x = 3. */
const COUNTEREXAMPLE = outcome("counterexample", {
  failing: failing(5n, (c) => c.note("seen 5")),
  explanation: [{ label: "x", value: 5, anyValueFails: false, nearest: { value: 4 } }],
  others: [failing(3n)],
  token: "prop1:AQ",
});

/** Returns a flaky outcome of a divergence. */
function flaky(divergence: Divergence): Outcome {
  return outcome("flaky", { divergence });
}

describe("detail", () => {
  describe("FOR_ALL", () => {
    it("is the id of the assertion of forAll", ({ seat }) => {
      check.isEqualTo(seat, FOR_ALL, "prop-for-all", "the id");
    });
  });

  describe("detailOf", () => {
    it("returns null for every part of a run that passed", ({ seat }) => {
      check.isEqualTo(
        seat,
        detailOf(outcome("passed")),
        {
          outcome: "passed",
          cases: 3,
          rejected: 1,
          seed: "7",
          counterexample: null,
          failure: null,
          choices: null,
          others: null,
          divergence: null,
          coverage: null,
          reason: null,
        },
        "the detail of a pass",
      );
    });

    it("returns the reason of a run that skipped", ({ seat }) => {
      check.isEqualTo(
        seat,
        detailOf(outcome("skipped", { reason: "the case needs a capability" }))[
          "reason"
        ],
        "the case needs a capability",
        "the reason",
      );
    });

    it("returns every part of a counterexample", ({ seat }) => {
      const d = detailOf(COUNTEREXAMPLE);

      check.isEqualTo(
        seat,
        [d["counterexample"], d["failure"], d["choices"], d["others"]],
        [
          [{ label: "x", value: 5, anyValueFails: false, nearestPassing: 4 }],
          RECORD,
          "prop1:AQ",
          [
            {
              counterexample: [{ label: "x", value: 3, anyValueFails: null }],
              failure: RECORD,
              choices: encode([{ kind: "integer", value: 3n }]),
            },
          ],
        ],
        "the parts of a counterexample",
      );
    });

    it("returns null as the token of a counterexample of values", ({ seat }) => {
      const d = detailOf(
        outcome("counterexample", { failing: failing(5n), valued: true }),
      );

      check.isNil(seat, d["choices"], "an example of values has no token");
    });

    it("returns the steps of a machine between the draws", ({ seat }) => {
      const run = outcome("counterexample", {
        failing: failing(5n, (c) => {
          c.step({ action: "put", client: 1 });
          c.step({ action: "deliver", drain: true });
          c.step({ action: "get" });
        }),
      });

      check.isEqualTo(
        seat,
        detailOf(run)["counterexample"],
        [
          { label: "x", value: 5, anyValueFails: null },
          { step: "put", client: 1 },
          { step: "deliver", drain: true },
          { step: "get" },
        ],
        "the steps after the draw",
      );
    });

    it("returns the case that a flaky replay contradicted without its token", ({
      seat,
    }) => {
      const d = detailOf(outcome("flaky", { failing: failing(5n), token: "prop1:AQ" }));

      check.isEqualTo(
        seat,
        [d["failure"], d["choices"], d["others"]],
        [RECORD, null, null],
        "the failure alone",
      );
    });

    {
      const tests = [
        {
          name: "an integer request against no request",
          give: {
            what: "request",
            index: 2,
            recorded: new IntegerBounds(0n, 9n),
            replayed: undefined,
          },
          want: [{ kind: "integer", min: 0, max: 9 }, null],
        },
        {
          name: "a float request against a sequence request",
          give: {
            what: "request",
            index: 0,
            recorded: new FloatBounds(0, 1, true, 32),
            replayed: new SequenceBounds(4, 1, undefined),
          },
          want: [
            { kind: "float", min: 0, max: 1, allow_nan: true, width: 32 },
            { kind: "sequence", k: 4, min_size: 1, max_size: null },
          ],
        },
        {
          name: "two fingerprints",
          give: { what: "fingerprint", index: 1, recorded: 5n, replayed: 6n },
          want: [5n, 6n],
        },
        {
          name: "a failure's identity against a pass",
          give: {
            what: "verdict",
            index: 3,
            recorded: keyOf(ofRecord(RECORD)),
            replayed: undefined,
          },
          want: ["equal at total.test.ts:9", null],
        },
      ] as const;
      for (const tt of tests) {
        it(`returns the sides of a divergence of ${tt.name}`, ({ seat }) => {
          const d = detailOf(flaky(tt.give as Divergence))["divergence"] as Record<
            string,
            unknown
          >;

          check.isEqualTo(
            seat,
            [d["recorded"], d["replayed"]] as readonly unknown[],
            tt.want,
            "the two sides",
          );
        });
      }
    }

    it("returns the place at which a run diverged", ({ seat }) => {
      const divergence: Divergence = {
        what: "request",
        index: 2,
        recorded: undefined,
        replayed: undefined,
        label: "x",
        step: { part: "sequential", position: 1, action: "put" },
      };

      check.isEqualTo(
        seat,
        detailOf(flaky(divergence))["divergence"],
        {
          what: "request",
          index: 2,
          recorded: null,
          replayed: null,
          label: "x",
          step: { part: "sequential", position: 1, action: "put" },
        },
        "the place of the divergence",
      );
    });

    it("returns null for the part of a machine's step that a divergence does not state", ({
      seat,
    }) => {
      const divergence: Divergence = {
        what: "request",
        index: 0,
        recorded: undefined,
        replayed: undefined,
        step: { part: "swarm" },
      };

      check.isEqualTo(
        seat,
        (detailOf(flaky(divergence))["divergence"] as Record<string, unknown>)["step"],
        { part: "swarm", position: null, action: null },
        "the part alone",
      );
    });

    it("returns the requirement that a coverage-unmet run missed", ({ seat }) => {
      const run = outcome("coverage-unmet", {
        shortfall: {
          requirement: { label: "even", share: 0.5 },
          counted: 1,
          valid: 100,
          verdict: "unmet",
        },
      });

      check.isEqualTo(
        seat,
        detailOf(run)["coverage"],
        { label: "even", share: 0.5, counted: 1, valid: 100, verdict: "unmet" },
        "the shortfall",
      );
    });
  });

  describe("resultOf", () => {
    it("returns the counts and the seed of a run that passed", ({ seat }) => {
      const run = outcome("passed");

      check.isEqualTo(
        seat,
        resultOf(run, detailOf(run)),
        {
          outcome: "passed",
          cases: 3,
          rejected: 1,
          seed: 7n,
          counterexample: null,
          failure: null,
          choices: null,
          others: null,
          divergence: null,
          coverage: null,
          reason: null,
        },
        "the counts and the seed alone",
      );
    });

    it("returns the seed of the run as a bigint", ({ seat }) => {
      const run = { ...outcome("passed"), seed: 2n ** 64n - 1n };

      check.isEqualTo(
        seat,
        resultOf(run, detailOf(run)).seed,
        2n ** 64n - 1n,
        "the largest seed, which the detail states as text",
      );
    });

    it("returns the values of the detail of a counterexample", ({ seat }) => {
      const detail = detailOf(COUNTEREXAMPLE);
      const result = resultOf(COUNTEREXAMPLE, detail);

      check.isEqualTo<unknown[]>(
        seat,
        [
          result.outcome,
          result.counterexample,
          result.failure,
          result.choices,
          result.others,
        ],
        [
          detail["outcome"],
          detail["counterexample"],
          detail["failure"],
          detail["choices"],
          detail["others"],
        ],
        "the values of the detail",
      );
    });

    it("returns the reason of a run that skipped", ({ seat }) => {
      const run = outcome("skipped", { reason: "unsupported" });

      check.isEqualTo(
        seat,
        resultOf(run, detailOf(run)).reason,
        "unsupported",
        "the reason",
      );
    });
  });

  describe("recordOf", () => {
    it("returns the record of a run at the property's call", ({ seat }) => {
      const { failure, json } = recordOf(
        COUNTEREXAMPLE,
        detailOf(COUNTEREXAMPLE),
        FOR_ALL,
        "every total is positive",
        WHERE,
      );

      check.isEqualTo(
        seat,
        [
          failure.assertion,
          failure.contract,
          failure.where,
          failure.detail,
          json["outcome"],
        ],
        [
          FOR_ALL,
          "every total is positive",
          WHERE,
          detailOf(COUNTEREXAMPLE),
          "counterexample",
        ],
        "the record",
      );
    });
  });
});
