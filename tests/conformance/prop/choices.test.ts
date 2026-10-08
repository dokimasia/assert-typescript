/** The spec of the corpus form of choices, bounds and seeds. */

import { describe } from "vitest";
import {
  boundsLiteral,
  choiceLiteral,
  parseChoice,
  parseChoices,
  seedOf,
} from "../../../src/conformance/prop/choices.js";
import { check } from "../../../src/index.js";
import {
  type Bounds,
  type Choice,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
  sameChoice,
} from "../../../src/prop/engine/choice.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

describe("choices", () => {
  describe("choiceLiteral", () => {
    const tests: { name: string; give: Choice; want: unknown }[] = [
      {
        name: "a safe integer as a JSON integer",
        give: { kind: "integer", value: -3n },
        want: -3,
      },
      {
        name: "an unsafe integer as a decimal string",
        give: { kind: "integer", value: 2n ** 60n },
        want: String(2n ** 60n),
      },
      {
        name: "a float as its number",
        give: { kind: "float", value: 1.5 },
        want: { float: 1.5 },
      },
      {
        name: "NaN by its name",
        give: { kind: "float", value: Number.NaN },
        want: { float: "NaN" },
      },
      {
        name: "a sequence as its elements",
        give: { kind: "sequence", value: [1, 2] },
        want: { sequence: [1, 2] },
      },
    ];
    for (const tt of tests) {
      it(`writes ${tt.name}`, ({ seat }) => {
        check.equal(seat, choiceLiteral(tt.give), tt.want, "the corpus form");
      });
    }
  });

  describe("parseChoice", () => {
    const tests: { name: string; give: unknown; want: Choice }[] = [
      { name: "a JSON integer", give: 7, want: { kind: "integer", value: 7n } },
      {
        name: "a decimal string beyond 2^53 − 1",
        give: String(2n ** 60n),
        want: { kind: "integer", value: 2n ** 60n },
      },
      { name: "a float", give: { float: 0.5 }, want: { kind: "float", value: 0.5 } },
      {
        name: "a float's name",
        give: { float: "-Inf" },
        want: { kind: "float", value: Number.NEGATIVE_INFINITY },
      },
      {
        name: "a sequence",
        give: { sequence: [3, 4] },
        want: { kind: "sequence", value: [3, 4] },
      },
    ];
    for (const tt of tests) {
      it(`reads ${tt.name}`, ({ seat }) => {
        check.isTrue(seat, sameChoice(parseChoice(tt.give), tt.want), "the choice");
      });
    }

    const refusals = [
      {
        name: "an object of another key",
        give: { integer: 1 },
        want: 'prop: {"integer":1} is no choice',
      },
      {
        name: "an object of two keys",
        give: { float: 1, sequence: [] },
        want: 'prop: {"float":1,"sequence":[]} is no choice',
      },
      {
        name: "a sequence that is no list",
        give: { sequence: 1 },
        want: 'prop: {"sequence":1} is no choice',
      },
      { name: "a list", give: [1], want: "prop: [1] is no integer" },
    ];
    for (const tt of refusals) {
      it(`throws for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => parseChoice(tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("parseChoices", () => {
    it("reads a list of choices", ({ seat }) => {
      check.equal(
        seat,
        parseChoices([1, { sequence: [] }]),
        [
          { kind: "integer", value: 1n },
          { kind: "sequence", value: [] },
        ],
        "two choices",
      );
    });

    it("throws for a value that is no list", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => parseChoices(1)),
        "prop: 1 is no list of choices",
        "the refusal",
      );
    });
  });

  describe("seedOf", () => {
    it("reads a decimal string", ({ seat }) => {
      check.equal(
        seat,
        seedOf("18446744073709551615"),
        2n ** 64n - 1n,
        "the largest seed",
      );
    });

    const refusals = [
      { name: "a number", give: 7 as unknown },
      { name: "a negative decimal string", give: "-7" },
      { name: "an empty string", give: "" },
    ];
    for (const tt of refusals) {
      it(`throws for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => seedOf(tt.give)),
          `prop: the seed ${JSON.stringify(tt.give)} is no decimal string`,
          "the refusal",
        );
      });
    }
  });

  describe("boundsLiteral", () => {
    const tests: { name: string; give: Bounds; want: Record<string, unknown> }[] = [
      {
        name: "integer bounds",
        give: new IntegerBounds(-1n, 2n ** 60n),
        want: { kind: "integer", min: -1, max: String(2n ** 60n) },
      },
      {
        name: "float bounds",
        give: new FloatBounds(Number.NEGATIVE_INFINITY, 1, true, 32),
        want: { kind: "float", min: "-Inf", max: 1, allow_nan: true, width: 32 },
      },
      {
        name: "sequence bounds with a maximum",
        give: new SequenceBounds(4, 1, 3),
        want: { kind: "sequence", k: 4, min_size: 1, max_size: 3 },
      },
      {
        name: "sequence bounds without a maximum",
        give: new SequenceBounds(4),
        want: { kind: "sequence", k: 4, min_size: 0, max_size: null },
      },
    ];
    for (const tt of tests) {
      it(`writes ${tt.name}`, ({ seat }) => {
        check.equal(seat, boundsLiteral(tt.give), tt.want, "the corpus form");
      });
    }
  });
});
