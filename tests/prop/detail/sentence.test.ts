// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the sentence of a failed property's record. */

import { describe } from "vitest";
import { Failure, render } from "../../../src/failure.js";
import { check } from "../../../src/index.js";
import { registerSentences, sentence } from "../../../src/prop/detail/sentence.js";
import { detailOf, FOR_ALL, recordOf } from "../../../src/prop/detail.js";
import { Replaying } from "../../../src/prop/engine/case/providers.js";
import { Failed } from "../../../src/prop/engine/case/signals.js";
import { Case } from "../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import type { Divergence, Execution } from "../../../src/prop/engine/execution.js";
import type { Outcome } from "../../../src/prop/engine/tally.js";
import { encode } from "../../../src/prop/engine/token.js";
import { integer } from "../../../src/prop/generators.js";
import { keyOf, ofRecord } from "../../../src/prop/identity.js";
import { test as it } from "../../../src/vitest.js";

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

describe("sentence", () => {
  describe("sentence", () => {
    it("returns the sentence of every part of a counterexample", ({ seat }) => {
      const { failure } = recordOf(
        COUNTEREXAMPLE,
        FOR_ALL,
        "every total is positive",
        WHERE,
      );

      check.isEqualTo(
        seat,
        sentence(failure),
        [
          "every total is positive: counterexample after 3 valid and 1 rejected cases, seed 7",
          "  x: 5, 4 passes",
          `failure of equal at total.test.ts:9: ${render(RECORD)}`,
          'replay: prop.replay("prop1:AQ") or DOKIMI_ASSERT_PROP_REPLAY=prop1:AQ',
          `other failure of equal at total.test.ts:9: ${render(RECORD)}`,
          "  x: 3",
          `replay: prop.replay("${encode([{ kind: "integer", value: 3n }])}") or DOKIMI_ASSERT_PROP_REPLAY=${encode([{ kind: "integer", value: 3n }])}`,
          "note: seen 5",
        ].join("\n"),
        "the sentence",
      );
    });

    it("states every entry of a machine's counterexample", ({ seat }) => {
      const run = outcome("counterexample", {
        failing: failing(5n, (c) => {
          c.step({ action: "put", client: 1, drain: true });
          c.step({ action: "get" });
        }),
        explanation: [
          { label: "x", value: 5, anyValueFails: true, nearest: undefined },
        ],
      });
      const { failure } = recordOf(run, FOR_ALL, "c", WHERE);

      check.containsInOrder(
        seat,
        sentence(failure),
        [
          "\n  x: 5, any value fails\n",
          "  step put on client 1 in the drain\n",
          "  step get\n",
        ],
        "the entries",
      );
    });

    it("states a message's failure without an assertion or a location", ({ seat }) => {
      const message = new Failure("", "it broke", {});
      const identity = ofRecord(message);
      const run = outcome("flaky", {
        failing: {
          case: new Case(new Replaying([])),
          status: "failed",
          failure: new Failed(keyOf(identity), { failure: message, identity }),
        },
      });

      check.containsInOrder(
        seat,
        sentence(recordOf(run, FOR_ALL, "c", WHERE).failure),
        ["\nfailure: it broke"],
        "the message",
      );
    });

    {
      const tests = [
        {
          name: "a request at a draw",
          give: {
            what: "request",
            index: 2,
            recorded: new IntegerBounds(0n, 9n),
            replayed: undefined,
            label: "x",
          },
          want: '\ndivergence: the request at 2 (in the draw "x"), recorded {kind: "integer", min: 0, max: 9}, replayed no request',
        },
        {
          name: "a fingerprint",
          give: { what: "fingerprint", index: 1, recorded: undefined, replayed: 6n },
          want: "\ndivergence: the fingerprint at 1, recorded no fingerprint, replayed 6",
        },
        {
          name: "a verdict",
          give: {
            what: "verdict",
            index: 3,
            recorded: keyOf(ofRecord(RECORD)),
            replayed: undefined,
          },
          want: "\ndivergence: the verdict at 3, recorded equal at total.test.ts:9, replayed no failure",
        },
      ] as const;
      for (const tt of tests) {
        it(`states the divergence of ${tt.name}`, ({ seat }) => {
          const { failure } = recordOf(
            flaky(tt.give as Divergence),
            FOR_ALL,
            "c",
            WHERE,
          );

          check.hasSuffix(seat, sentence(failure), tt.want, "the divergence");
        });
      }
    }

    it("states the requirement that a run missed", ({ seat }) => {
      const run = outcome("coverage-unmet", {
        shortfall: {
          requirement: { label: "even", share: 0.5 },
          counted: 1,
          valid: 100,
          verdict: "unmet",
        },
      });
      const { failure } = recordOf(run, FOR_ALL, "c", WHERE);

      check.isEqualTo(
        seat,
        sentence(failure),
        'c: coverage-unmet after 3 valid and 1 rejected cases, seed 7\ncoverage: unmet, "even" counted 1 of 100 valid cases against a required share of 0.5',
        "the requirement",
      );
    });

    it("states no note of a record that recordOf did not return", ({ seat }) => {
      const failure = new Failure(FOR_ALL, "c", detailOf(outcome("vacuous")));

      check.isEqualTo(
        seat,
        sentence(failure),
        "c: vacuous after 3 valid and 1 rejected cases, seed 7",
        "the outcome alone",
      );
    });
  });

  describe("registerSentences", () => {
    it("makes the sentence of the run the sentence of each assertion's record", ({
      seat,
    }) => {
      registerSentences(["prop-registered"]);
      const failure = new Failure(
        "prop-registered",
        "c",
        detailOf(outcome("rejected")),
      );

      check.isEqualTo(
        seat,
        render(failure),
        sentence(failure),
        "the registered sentence",
      );
    });
  });
});
