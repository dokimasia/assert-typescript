// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the detail of a property's run as its call record states it. */

import { describe } from "vitest";
import { Failure } from "../../../src/failure.js";
import { check } from "../../../src/index.js";
import { detailJson } from "../../../src/prop/detail/json.js";
import { detailOf } from "../../../src/prop/detail.js";
import { Replaying } from "../../../src/prop/engine/case/providers.js";
import { Failed } from "../../../src/prop/engine/case/signals.js";
import { Case } from "../../../src/prop/engine/case.js";
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

describe("json", () => {
  describe("detailJson", () => {
    it("returns each drawn value as a typed literal of its generator's type", ({
      seat,
    }) => {
      const json = detailJson(COUNTEREXAMPLE, detailOf(COUNTEREXAMPLE));

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
        seat,
        [divergence["recorded"], divergence["replayed"]],
        [5, null],
        "the fingerprints",
      );
    });

    it("returns null for the parts that the outcome does not use", ({ seat }) => {
      const json = detailJson(outcome("passed"), detailOf(outcome("passed")));

      check.isEqualTo(
        seat,
        [json["counterexample"], json["failure"], json["others"], json["divergence"]],
        [null, null, null, null],
        "no part",
      );
    });
  });
});
