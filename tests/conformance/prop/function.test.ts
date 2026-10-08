/** The spec of the functions of the subject kinds that take one input. */

import { describe } from "vitest";
import { FUNCTIONS } from "../../../src/conformance/prop/function.js";
import { check } from "../../../src/index.js";
import { test as it } from "../../../src/vitest.js";

/** Returns the function of a subject kind. */
function of(kind: string): (x: unknown) => unknown {
  return FUNCTIONS.get(kind) as (x: unknown) => unknown;
}

describe("function", () => {
  describe("FUNCTIONS", () => {
    it("states the functions of seven subject kinds", ({ seat }) => {
      check.equal(
        seat,
        [...FUNCTIONS.keys()],
        [
          "identity",
          "is-non-negative",
          "returns-null",
          "drops-the-first",
          "prepends-zero",
          "sorts",
          "wraps-in-a-and-b",
        ],
        "the kinds",
      );
    });

    const tests = [
      {
        name: "identity returns its input",
        give: ["identity", 5n] as const,
        want: 5n as unknown,
      },
      {
        name: "is-non-negative returns true for zero",
        give: ["is-non-negative", 0n] as const,
        want: true,
      },
      {
        name: "is-non-negative returns false for a negative number",
        give: ["is-non-negative", -1] as const,
        want: false,
      },
      {
        name: "returns-null returns undefined",
        give: ["returns-null", 5n] as const,
        want: undefined,
      },
      {
        name: "drops-the-first drops the first element of a list",
        give: ["drops-the-first", [1n, 2n, 3n]] as const,
        want: [2n, 3n],
      },
      {
        name: "drops-the-first drops the first code point of a string",
        give: ["drops-the-first", "\u{1f600}ab"] as const,
        want: "ab",
      },
      {
        name: "prepends-zero prepends the integer 0",
        give: ["prepends-zero", [5n]] as const,
        want: [0n, 5n],
      },
      {
        name: "sorts sorts numbers by value",
        give: ["sorts", [3n, 1n, 2n, 1n]] as const,
        want: [1n, 1n, 2n, 3n],
      },
      {
        name: "sorts sorts strings by code point",
        give: ["sorts", ["\u{10000}", "￿", "b", "ab", "a", "b"]] as const,
        want: ["a", "ab", "b", "b", "￿", "\u{10000}"],
      },
      {
        name: "wraps-in-a-and-b wraps the text of its input",
        give: ["wraps-in-a-and-b", 1001n] as const,
        want: "a1001b",
      },
    ];
    for (const tt of tests) {
      it(`states that ${tt.name}`, ({ seat }) => {
        const [kind, input] = tt.give;

        check.equal(seat, of(kind)(input), tt.want, "the function's value");
      });
    }

    it("states that sorts leaves its input unchanged", ({ seat }) => {
      const input = [2n, 1n];
      of("sorts")(input);

      check.equal(seat, input, [2n, 1n], "the input");
    });
  });
});
