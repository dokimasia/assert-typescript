/** The spec of the record of a property's run, and of its sentence. */

import { describe } from "vitest";
import { Failure, render } from "../../src/failure.js";
import { check } from "../../src/index.js";
import {
  detailJson,
  detailOf,
  FOR_ALL,
  recordOf,
  registerSentences,
  sentence,
} from "../../src/prop/detail.js";
import { Case, Failed, Replaying } from "../../src/prop/engine/case.js";
import {
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../src/prop/engine/choice.js";
import type { Divergence, Execution } from "../../src/prop/engine/execution.js";
import type { Outcome } from "../../src/prop/engine/runner.js";
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
      check.equal(seat, FOR_ALL, "prop-for-all", "the id");
    });
  });

  describe("detailOf", () => {
    it("returns null for every part of a run that passed", ({ seat }) => {
      check.equal(
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
        },
        "the detail of a pass",
      );
    });

    it("returns every part of a counterexample", ({ seat }) => {
      const d = detailOf(COUNTEREXAMPLE);

      check.equal(
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

      check.equal(
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

      check.equal(
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

          check.equal(
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

      check.equal(
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

      check.equal(
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

      check.equal(
        seat,
        detailOf(run)["coverage"],
        { label: "even", share: 0.5, counted: 1, valid: 100, verdict: "unmet" },
        "the shortfall",
      );
    });
  });

  describe("detailJson", () => {
    it("returns each drawn value as a typed literal of its generator's type", ({
      seat,
    }) => {
      const json = detailJson(COUNTEREXAMPLE, detailOf(COUNTEREXAMPLE));

      check.equal(
        seat,
        json["counterexample"],
        [
          {
            label: "x",
            value: { type: "int", value: 5 },
            "any-value-fails": false,
            "nearest-passing": { type: "int", value: 4 },
          },
        ],
        "the counterexample as JSON",
      );
    });

    it("returns null as the nearest passing value of a draw that states none", ({
      seat,
    }) => {
      const run = outcome("counterexample", { failing: failing(5n) });
      const json = detailJson(run, detailOf(run));

      check.equal(
        seat,
        json["counterexample"],
        [
          {
            label: "x",
            value: { type: "int", value: 5 },
            "any-value-fails": null,
            "nearest-passing": null,
          },
        ],
        "no nearest value",
      );
    });

    it("returns an opaque literal of a value that no typed literal states", ({
      seat,
    }) => {
      const c = new Case(new Replaying([{ kind: "integer", value: 1n }]));
      c.draw(
        integer(0, 9).map(() => () => 1),
        "f",
      );
      const identity = ofRecord(RECORD);
      const run = outcome("counterexample", {
        failing: {
          case: c,
          status: "failed",
          failure: new Failed(keyOf(identity), { failure: RECORD, identity }),
        },
        explanation: [
          {
            label: "f",
            value: () => 1,
            anyValueFails: true,
            nearest: { value: [() => 2][0] },
          },
        ],
      });

      check.equal(
        seat,
        detailJson(run, detailOf(run))["counterexample"],
        [
          {
            label: "f",
            value: { type: "opaque", text: "[function anonymous]" },
            "any-value-fails": true,
            "nearest-passing": { type: "opaque", text: "[function anonymous]" },
          },
        ],
        "opaque values",
      );
    });

    it("returns the failure as the JSON of its record", ({ seat }) => {
      const json = detailJson(COUNTEREXAMPLE, detailOf(COUNTEREXAMPLE));

      check.equal(
        seat,
        json["failure"],
        {
          assertion: "equal",
          contract: "the totals agree",
          detail: { want: { type: "int", value: 1 }, got: { type: "int", value: 2 } },
          where: { file: "total.test.ts", line: 9 },
        },
        "the record as JSON",
      );
    });

    it("returns a message's record without an assertion or a location", ({ seat }) => {
      const message = new Failure("", "it broke", {});
      const identity = ofRecord(message);
      const c = new Case(new Replaying([]));
      const run = outcome("counterexample", {
        failing: {
          case: c,
          status: "failed",
          failure: new Failed(keyOf(identity), { failure: message, identity }),
        },
      });

      check.equal(
        seat,
        detailJson(run, detailOf(run))["failure"],
        { assertion: null, contract: "it broke", detail: {}, where: null },
        "a message",
      );
    });

    it("returns each other failure as a brief counterexample with its token", ({
      seat,
    }) => {
      const json = detailJson(COUNTEREXAMPLE, detailOf(COUNTEREXAMPLE));
      const [other] = json["others"] as Record<string, unknown>[];

      check.equal(
        seat,
        [other?.["counterexample"], other?.["choices"]],
        [
          [{ label: "x", value: { type: "int", value: 3 } }],
          encode([{ kind: "integer", value: 3n }]),
        ],
        "the other failure",
      );
    });

    it("returns the steps of a machine as they are", ({ seat }) => {
      const run = outcome("counterexample", {
        failing: failing(5n, (c) => c.step({ action: "put" })),
      });

      check.equal(
        seat,
        (detailJson(run, detailOf(run))["counterexample"] as unknown[])[1],
        { step: "put" },
        "the step",
      );
    });

    it("returns a fingerprint of a divergence as a number", ({ seat }) => {
      const run = flaky({
        what: "fingerprint",
        index: 0,
        recorded: 5n,
        replayed: undefined,
      });
      const divergence = detailJson(run, detailOf(run))["divergence"] as Record<
        string,
        unknown
      >;

      check.equal(
        seat,
        [divergence["recorded"], divergence["replayed"]],
        [5, null],
        "the fingerprints",
      );
    });

    it("returns null for the parts that the outcome does not use", ({ seat }) => {
      const json = detailJson(outcome("passed"), detailOf(outcome("passed")));

      check.equal(
        seat,
        [json["counterexample"], json["failure"], json["others"], json["divergence"]],
        [null, null, null, null],
        "no part",
      );
    });
  });

  describe("recordOf", () => {
    it("returns the record of a run at the property's call", ({ seat }) => {
      const { failure, json } = recordOf(
        COUNTEREXAMPLE,
        FOR_ALL,
        "every total is positive",
        WHERE,
      );

      check.equal(
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

  describe("sentence", () => {
    it("returns the sentence of every part of a counterexample", ({ seat }) => {
      const { failure } = recordOf(
        COUNTEREXAMPLE,
        FOR_ALL,
        "every total is positive",
        WHERE,
      );

      check.equal(
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
          want: "\ndivergence: the verdict at 3, recorded equal at total.test.ts:9, replayed a pass",
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

      check.equal(
        seat,
        sentence(failure),
        'c: coverage-unmet after 3 valid and 1 rejected cases, seed 7\ncoverage: unmet, "even" counted 1 of 100 valid cases against a required share of 0.5',
        "the requirement",
      );
    });

    it("states no note of a record that recordOf did not return", ({ seat }) => {
      const failure = new Failure(FOR_ALL, "c", detailOf(outcome("vacuous")));

      check.equal(
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

      check.equal(seat, render(failure), sentence(failure), "the registered sentence");
    });
  });
});
