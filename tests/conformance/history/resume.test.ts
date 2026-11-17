// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the runner of the resume vectors. It uses vitest's `expect`
 * alone, because the runner decides the verdict of every resume vector.
 */

import { describe, expect, it } from "vitest";
import { checkResume } from "../../../src/conformance/history/resume.js";
import { vectors } from "../../../src/conformance/vector.js";
import { Fault } from "../../../src/matcher/fault.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The resume vectors of the definition, by id. */
const VECTORS = new Map(
  vectors()
    .filter((v) => v.kind === "resume")
    .map((v) => [v.id, v.raw as Raw]),
);

/** The id of a resume vector of three passing checks over one partition. */
const RESUME = "resume/sequential-calls-step-each-new-call-once";

/** The id of a resume vector of two violated checks. */
const VIOLATED = "resume/a-violated-check-leaves-no-search";

/** Returns the vector of an id. */
function vector(id: string): Raw {
  return VECTORS.get(id) as Raw;
}

/** Returns the fault that checkResume throws for raw, as its place and its reason. */
function fault(raw: Raw): [string, string] {
  try {
    checkResume(raw);
  } catch (err) {
    if (err instanceof Fault) {
      return [err.at, err.reason];
    }
    throw err;
  }
  return ["", ""];
}

/** Returns the resume vector of an id with check in place of its check i. */
function withCheck(id: string, i: number, check: unknown): Raw {
  const checks = [...(vector(id)["checks"] as unknown[])];
  checks[i] = check;
  return { ...vector(id), checks };
}

/** Returns the resume vector of an id with changes to the members of its result i. */
function withResult(id: string, i: number, changes: Raw): Raw {
  const results = [...(vector(id)["results"] as Raw[])];
  results[i] = { ...results[i], ...changes };
  return { ...vector(id), results };
}

/** Returns the detail of the result i of a resume vector with changes. */
function detailOf(id: string, i: number, changes: Raw): Raw {
  return {
    ...(((vector(id)["results"] as Raw[])[i] as Raw)["detail"] as Raw),
    ...changes,
  };
}

describe("resume", () => {
  describe("checkResume", () => {
    it("runs the 7 resume vectors of the definition", () => {
      expect(VECTORS.size).toBe(7);
    });

    for (const [id, raw] of VECTORS) {
      it(`agrees with the vector ${id}`, () => {
        expect(() => checkResume(raw)).not.toThrow();
      });
    }

    const tests: { name: string; give: Raw; want: [string, string] }[] = [
      {
        name: "a vector of no named spec",
        give: { ...vector(RESUME), spec: "widget" },
        want: ["spec", '"widget" is no named spec'],
      },
      {
        name: "a vector whose history is no list",
        give: { ...vector(RESUME), history: {} },
        want: ["history", "the script is no list"],
      },
      {
        name: "a vector whose checks are no list",
        give: { ...vector(RESUME), checks: {} },
        want: ["checks", "the checks are no list"],
      },
      {
        name: "a vector of fewer results than checks",
        give: {
          ...vector(RESUME),
          results: (vector(RESUME)["results"] as Raw[]).slice(0, 2),
        },
        want: ["results", "the vector states 2 results, want one for each of 3 checks"],
      },
      {
        name: "a vector whose results are no list",
        give: { ...vector(RESUME), results: {} },
        want: ["results", "the vector states 0 results, want one for each of 3 checks"],
      },
      {
        name: "a check that is no object",
        give: withCheck(RESUME, 0, 1),
        want: ["checks[0]", "the check is no object"],
      },
      {
        name: "a check that reads events past the history",
        give: withCheck(RESUME, 0, { events: 7 }),
        want: ["checks[0].events", "the check reads 7 events, want 1 to 6"],
      },
      {
        name: "a check that reads fewer events than the check before it",
        give: withCheck(RESUME, 1, { events: 1 }),
        want: ["checks[1].events", "the check reads 1 events, want 2 to 6"],
      },
      {
        name: "a check whose events are no number",
        give: withCheck(RESUME, 0, { events: "2" }),
        want: ["checks[0].events", 'the check reads "2" events, want 1 to 6'],
      },
      {
        name: "a check whose budget is below 1",
        give: withCheck(RESUME, 0, { events: 2, budget: 0 }),
        want: ["checks[0].budget", "the budget is 0, no integer of 1 or more"],
      },
      {
        name: "a vector whose history the seam refuses",
        give: {
          ...vector(RESUME),
          history: [
            {
              invoke: 0,
              client: 0,
              operation: "write",
              args: [{ type: "int", value: 1 }],
              keys: [{ type: "string", value: "x" }],
            },
            { invoke: 1, client: 0, operation: "read", args: [], keys: [] },
          ],
          checks: [{ events: 2 }],
          results: (vector(RESUME)["results"] as Raw[]).slice(0, 1),
        },
        want: ["history[1]", "the seam refuses the entry"],
      },
      {
        name: "a result that is no object",
        give: {
          ...vector(RESUME),
          results: [1, ...(vector(RESUME)["results"] as Raw[]).slice(1)],
        },
        want: ["results[0]", "the result is no object"],
      },
      {
        name: "a result that expects neither pass nor fail",
        give: withResult(RESUME, 0, { expect: "maybe" }),
        want: [
          "results[0].expect",
          'the vector expects "maybe", neither pass nor fail',
        ],
      },
      {
        name: "a result of another verdict",
        give: withResult(RESUME, 0, { expect: "fail" }),
        want: ["results[0].expect", "the check ends as pass, want fail"],
      },
      {
        name: "a failure of another field",
        give: withResult(VIOLATED, 0, {
          detail: detailOf(VIOLATED, 0, { steps: 9 }),
        }),
        want: ["results[0].detail.steps", "the field is 2, want 9"],
      },
      {
        name: "a pass whose steps are no number",
        give: withResult(RESUME, 0, { detail: detailOf(RESUME, 0, { steps: "1" }) }),
        want: [
          "results[0].detail.steps",
          'the detail states the steps "1", want a number',
        ],
      },
      {
        name: "a pass without a detail",
        give: withResult(RESUME, 0, { detail: undefined }),
        want: [
          "results[0].detail.steps",
          "the detail states the steps null, want a number",
        ],
      },
      {
        name: "a pass of other steps than a check of every call",
        give: withResult(RESUME, 1, { detail: detailOf(RESUME, 1, { steps: 3 }) }),
        want: [
          "results[1].detail.steps",
          "a check of every call takes 2 steps, want 3",
        ],
      },
      {
        name: "other calls of next",
        give: withResult(RESUME, 1, { "next-calls": 2 }),
        want: ["results[1].next-calls", "the check calls next 1 times, want 2"],
      },
      {
        name: "a result without the calls of next",
        give: withResult(RESUME, 0, { "next-calls": true }),
        want: ["results[0].next-calls", "the check calls next 1 times, want true"],
      },
    ];
    for (const tt of tests) {
      it(`throws a fault for ${tt.name}`, () => {
        expect(fault(tt.give)).toEqual(tt.want);
      });
    }
  });
});
