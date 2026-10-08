/** The spec of the detail of a run, as a property vector states it. */

import { describe } from "vitest";
import { detail, stepLiteral } from "../../../src/conformance/prop/detail.js";
import { check } from "../../../src/index.js";
import type { Case } from "../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import type { Body } from "../../../src/prop/engine/execution.js";
import { Integer } from "../../../src/prop/engine/generator.js";
import { type Outcome, run, Tally } from "../../../src/prop/engine/runner.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";

const SEED = 7n;
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));

/** Returns a body of a function that returns nothing. */
function body(fn: (c: Case) => void): Body {
  return (c) => {
    fn(c);
    return undefined;
  };
}

/** Returns the outcome of a run of a body. */
function ran(of: Body, cases = 100): Promise<Outcome> {
  return drive(run(of, { seed: SEED, cases }));
}

describe("detail", () => {
  describe("stepLiteral", () => {
    const tests = [
      { name: "a step of its action", give: { action: "put" }, want: { step: "put" } },
      {
        name: "a step of a client",
        give: { action: "get", client: 1 },
        want: { step: "get", client: 1 },
      },
      {
        name: "a step of the drain",
        give: { action: "put", drain: true },
        want: { step: "put", drain: true },
      },
      {
        name: "a step outside the drain",
        give: { action: "put", drain: false },
        want: { step: "put" },
      },
    ];
    for (const tt of tests) {
      it(`writes ${tt.name}`, ({ seat }) => {
        check.equal(seat, stepLiteral(tt.give), tt.want, "the corpus form");
      });
    }
  });

  describe("detail", () => {
    it("writes null for every field that a pass does not use", async ({ seat }) => {
      const passed = await ran(
        body((c) => {
          c.draw(WIDE, "n");
        }),
        10,
      );

      check.equal(
        seat,
        detail(passed),
        {
          outcome: "passed",
          cases: 10,
          rejected: 0,
          seed: "7",
          counterexample: null,
          failure: null,
          choices: null,
          others: null,
          divergence: null,
          coverage: null,
        },
        "a pass",
      );
    });

    it("writes every entry of a counterexample", async ({ seat }) => {
      const counterexample = await ran(
        body((c) => {
          c.step({ action: "put" });
          const n = c.draw(WIDE, "n");
          c.draw(WIDE, "noise");
          if (n > 1000n) c.fail("above");
        }),
      );
      const written = detail(counterexample);

      check.equal(
        seat,
        [
          written["outcome"],
          written["counterexample"],
          written["failure"],
          typeof written["choices"],
          written["others"],
        ],
        [
          "counterexample",
          [
            { step: "put" },
            {
              label: "n",
              value: { type: "int", value: 1001 },
              "any-value-fails": false,
              "nearest-passing": { type: "int", value: 1000 },
            },
            {
              label: "noise",
              value: { type: "int", value: 0 },
              "any-value-fails": true,
              "nearest-passing": null,
            },
          ],
          "above",
          "string",
          [],
        ],
        "the minimal case",
      );
    });

    it("writes every part of each other failure", async ({ seat }) => {
      const small = new Integer(new IntegerBounds(0n, 1000n));
      const counterexample = await ran(
        body((c) => {
          c.step({ action: "check", client: 0 });
          const value = c.draw(small, "x");
          if (value % 2n === 1n) c.fail("odd");
          if (value > 50n) c.fail("big");
        }),
      );
      const [other] = detail(counterexample)["others"] as Record<string, unknown>[];

      check.equal(
        seat,
        [other?.["failure"], other?.["counterexample"], typeof other?.["choices"]],
        [
          "big",
          [
            { step: "check", client: 0 },
            { label: "x", value: { type: "int", value: 52 } },
          ],
          "string",
        ],
        "the other failure",
      );
    });

    it("writes the draws of a counterexample without explanations as null", ({
      seat,
    }) => {
      const tally = new Tally(SEED);
      const failing = {
        case: {
          draws: [{ label: "n", value: 5n, span: 0, generator: WIDE }],
          steps: [],
          choices: [],
        },
        status: "failed",
        failure: { identity: "five" },
      } as unknown as NonNullable<Outcome["failing"]>;

      check.equal(
        seat,
        detail({ ...tally.outcome("counterexample", { failing }), valued: true })[
          "counterexample"
        ],
        [
          {
            label: "n",
            value: { type: "int", value: 5 },
            "any-value-fails": null,
            "nearest-passing": null,
          },
        ],
        "a found counterexample",
      );
    });

    const divergences = [
      {
        name: "the bounds of a request",
        give: {
          what: "request",
          index: 0,
          recorded: new IntegerBounds(0n, 9n),
          replayed: undefined,
          label: "n",
          step: { part: "sequential", position: 2, action: "put" },
        },
        want: {
          what: "request",
          index: 0,
          recorded: { kind: "integer", min: 0, max: 9 },
          replayed: null,
          label: "n",
          step: { part: "sequential", position: 2, action: "put" },
        },
      },
      {
        name: "two fingerprints at a step without a position",
        give: {
          what: "fingerprint",
          index: 1,
          recorded: 5n,
          replayed: 6n,
          step: { part: "settle" },
        },
        want: {
          what: "fingerprint",
          index: 1,
          recorded: 5,
          replayed: 6,
          label: null,
          step: { part: "settle", position: null, action: null },
        },
      },
      {
        name: "an identity against a pass",
        give: { what: "verdict", index: 3, recorded: "once", replayed: undefined },
        want: {
          what: "verdict",
          index: 3,
          recorded: "once",
          replayed: null,
          label: null,
          step: null,
        },
      },
    ] as const;
    for (const tt of divergences) {
      it(`writes the divergence of ${tt.name}`, ({ seat }) => {
        const flaky = new Tally(SEED).outcome("flaky", { divergence: tt.give });

        check.equal(seat, detail(flaky)["divergence"], tt.want, "the divergence");
      });
    }

    it("writes the case that a flaky replay contradicted", async ({ seat }) => {
      let calls = 0;
      const flaky = await ran(
        body((c) => {
          calls += 1;
          c.draw(WIDE, "n");
          if (calls === 2) c.fail("second");
        }),
      );
      const written = detail(flaky);

      check.equal(
        seat,
        [
          written["outcome"],
          written["failure"],
          written["choices"],
          written["others"],
          (written["counterexample"] as unknown[]).length,
        ],
        ["flaky", "second", null, null, 1],
        "the contradicted case",
      );
    });

    it("writes the shortfall of a coverage-unmet run", ({ seat }) => {
      const unmet = new Tally(SEED).outcome("coverage-unmet", {
        shortfall: {
          requirement: { label: "even", share: 0.5 },
          counted: 2,
          valid: 10,
          verdict: "refuted",
        },
      });

      check.equal(
        seat,
        detail(unmet)["coverage"],
        { label: "even", share: 0.5, counted: 2, valid: 10, verdict: "refuted" },
        "the shortfall",
      );
    });

    it("writes null choices for a counterexample without a token", ({ seat }) => {
      const tally = new Tally(SEED);

      check.equal(
        seat,
        detail(tally.outcome("counterexample"))["choices"],
        null,
        "no token",
      );
    });
  });
});
