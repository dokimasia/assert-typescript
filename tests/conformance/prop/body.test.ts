/** The spec of the bodies of the property vectors. */

import { describe } from "vitest";
import { buildBody, DRAWN } from "../../../src/conformance/prop/body.js";
import { check } from "../../../src/index.js";
import { MAX_CHOICES, Replaying } from "../../../src/prop/engine/case.js";
import {
  type Body,
  type Execution,
  execute,
} from "../../../src/prop/engine/execution.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** Returns the execution of a body on recorded integers. */
function executed(body: Body, ...values: bigint[]): Promise<Execution> {
  return drive(
    execute(
      body,
      new Replaying(values.map((value) => ({ kind: "integer", value }))),
      MAX_CHOICES,
    ),
  );
}

/** A body of a digit that is classified even, rejected at 3, and fails from 8. */
const DIGIT_BODY = buildBody({
  draw: { gen: "integer", min: 0, max: 9 },
  classify: { even: { kind: "divisible-by", n: 2 } },
  "rejects-when": { kind: "equals", value: { type: "int", value: 3 } },
  fails: [
    { identity: "big", when: { kind: "at-least", n: 8 } },
    { identity: "nine", when: { kind: "equals", value: { type: "int", value: 9 } } },
  ],
});

describe("body", () => {
  describe("DRAWN", () => {
    it("labels a body's one draw value", ({ seat }) => {
      check.equal(seat, DRAWN, "value", "the label");
    });
  });

  describe("buildBody", () => {
    it("returns a body that requests no input for draws-nothing", async ({ seat }) => {
      const execution = await executed(buildBody({ kind: "draws-nothing" }));

      check.equal(
        seat,
        [execution.status, execution.case.choices.length],
        ["passed", 0],
        "no choice",
      );
    });

    it("returns a body that draws a digit before a boolean for diverges", async ({
      seat,
    }) => {
      const body = buildBody({ kind: "diverges" });
      const first = await executed(body);
      const second = await executed(body);

      check.equal(
        seat,
        [first.case.requests[0]?.bounds.id, second.case.requests[0]?.bounds.id],
        ["integer 0 9", "integer 0 1"],
        "a digit, then a boolean",
      );
    });

    it("returns a body that fails once above 1000 for fails-once", async ({ seat }) => {
      const body = buildBody({ kind: "fails-once" });
      const runs = [
        await executed(body, 5n),
        await executed(body, 2000n),
        await executed(body, 3000n),
      ];

      check.equal(
        seat,
        runs.map((run) => run.status),
        ["passed", "failed", "passed"],
        "one failure",
      );
    });

    const tests = [
      {
        name: "passes an even digit under the label even",
        give: 4n,
        want: ["passed", ["even"], undefined] as unknown[],
      },
      {
        name: "rejects a digit for which rejects-when is true",
        give: 3n,
        want: ["rejected", [], undefined],
      },
      {
        name: "fails with the identity whose predicate is true",
        give: 8n,
        want: ["failed", ["even"], "big"],
      },
      {
        name: "fails with the first of two identities whose predicates are true",
        give: 9n,
        want: ["failed", [], "big"],
      },
    ];
    for (const tt of tests) {
      it(`returns a body that ${tt.name}`, async ({ seat }) => {
        const execution = await executed(DIGIT_BODY, tt.give);

        check.equal(
          seat,
          [
            execution.status,
            [...execution.case.labels],
            execution.failure?.identity,
          ] as unknown[],
          tt.want,
          "the run of the body",
        );
      });
    }

    it("returns a body that draws its value under the label value", async ({
      seat,
    }) => {
      check.equal(
        seat,
        (await executed(DIGIT_BODY, 4n)).case.draws[0]?.label,
        "value",
        "the label",
      );
    });

    it("returns a passing body without labels for a draw alone", async ({ seat }) => {
      const execution = await executed(
        buildBody({ draw: { gen: "integer", min: 0, max: 9 }, classify: null }),
        3n,
      );

      check.equal(
        seat,
        [execution.status, execution.case.labels.size],
        ["passed", 0],
        "a plain pass",
      );
    });

    const refusals = [
      {
        name: "a classify that is a list",
        give: { draw: { gen: "boolean" }, classify: [] },
        want: "prop: classify is [], not an object",
      },
      {
        name: "a classify that is a string",
        give: { draw: { gen: "boolean" }, classify: "even" },
        want: 'prop: classify is "even", not an object',
      },
      {
        name: "fails that are no list",
        give: { draw: { gen: "boolean" }, fails: 1 },
        want: "prop: fails is 1, not a list",
      },
      {
        name: "an identity that is no string",
        give: {
          draw: { gen: "boolean" },
          fails: [{ identity: 5, when: { kind: "always" } }],
        },
        want: "prop: 5 is no label and no identity",
      },
      {
        name: "a kind that names no body",
        give: { kind: "widget" },
        want: 'prop: "widget" names no body',
      },
    ];
    for (const tt of refusals) {
      it(`throws for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => buildBody(tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });
});
