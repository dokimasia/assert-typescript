/** The spec of machines: what a machine must state. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { type Action, validate } from "../../src/stateful/machine.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** Returns an action of name that does nothing, with the weight weight. */
function action(name: string, weight?: number): Action<unknown> {
  return { name, weight, run: () => undefined };
}

describe("machine", () => {
  describe("validate", () => {
    it("accepts a machine of actions with weights of 0 and more", ({ seat }) => {
      check.equal(
        seat,
        thrown(() =>
          validate({ actions: [action("a", 0), action("b"), action("c", 3)] }),
        ),
        "",
        "no refusal",
      );
    });

    const tests: { name: string; give: Action<unknown>[]; want: [string, string] }[] = [
      {
        name: "an action of a negative weight",
        give: [action("a", -1)],
        want: [
          "RangeError",
          'stateful: steps of a machine whose action "a" has the weight -1',
        ],
      },
      {
        name: "an action of a weight that is no integer",
        give: [action("a", 1.5)],
        want: [
          "RangeError",
          'stateful: steps of a machine whose action "a" has the weight 1.5',
        ],
      },
      {
        name: "an action without run",
        give: [{ name: "a" } as Action<unknown>],
        want: ["TypeError", 'stateful: steps of a machine whose action "a" has no run'],
      },
      {
        name: "two actions with one name",
        give: [action("a"), action("a")],
        want: ["Error", 'stateful: steps of a machine whose actions name "a" twice'],
      },
    ];
    for (const tt of tests) {
      it(`throws for ${tt.name}`, ({ seat }) => {
        const err = check.throws(
          seat,
          () => validate({ actions: tt.give }),
          "a refusal",
        );

        check.equal(
          seat,
          [(err as Error).name, (err as Error).message],
          tt.want,
          "the error",
        );
      });
    }
  });
});
