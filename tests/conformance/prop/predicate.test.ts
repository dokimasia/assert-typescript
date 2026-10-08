/** The spec of the predicates of the property vectors. */

import { describe } from "vitest";
import { predicate } from "../../../src/conformance/prop/predicate.js";
import { check } from "../../../src/index.js";
import { Pairs } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** The typed literal of an int. */
function int(value: number): Record<string, unknown> {
  return { type: "int", value };
}

describe("predicate", () => {
  describe("predicate", () => {
    const tests: {
      name: string;
      give: [Record<string, unknown>, unknown];
      want: boolean;
    }[] = [
      { name: "always on any value", give: [{ kind: "always" }, 1n], want: true },
      { name: "never on any value", give: [{ kind: "never" }, 1n], want: false },
      {
        name: "equals on an equal value",
        give: [{ kind: "equals", value: int(3) }, 3n],
        want: true,
      },
      {
        name: "equals on a float of the same number",
        give: [{ kind: "equals", value: int(3) }, 3],
        want: false,
      },
      {
        name: "at-least on an integer at n",
        give: [{ kind: "at-least", n: 5 }, 5n],
        want: true,
      },
      {
        name: "at-least on a float above a fraction",
        give: [{ kind: "at-least", n: 0.5 }, 0.75],
        want: true,
      },
      {
        name: "at-least on an integer below n",
        give: [{ kind: "at-least", n: 5 }, 4n],
        want: false,
      },
      {
        name: "at-least on a value that is no number",
        give: [{ kind: "at-least", n: 5 }, "9"],
        want: false,
      },
      {
        name: "divisible-by on a multiple",
        give: [{ kind: "divisible-by", n: 3 }, 9n],
        want: true,
      },
      {
        name: "divisible-by on another integer",
        give: [{ kind: "divisible-by", n: 3 }, 10n],
        want: false,
      },
      {
        name: "divisible-by on a float",
        give: [{ kind: "divisible-by", n: 3 }, 9],
        want: false,
      },
      {
        name: "sum-above on integers above n",
        give: [{ kind: "sum-above", n: 10 }, [5n, 6n]],
        want: true,
      },
      {
        name: "sum-above on mixed numbers above n",
        give: [{ kind: "sum-above", n: 1 }, [0.5, 1n]],
        want: true,
      },
      {
        name: "sum-above on integers at n",
        give: [{ kind: "sum-above", n: 10 }, [5n, 5n]],
        want: false,
      },
      {
        name: "sum-above on a value that is no list",
        give: [{ kind: "sum-above", n: 1 }, 5n],
        want: false,
      },
      {
        name: "length-at-least on a dict of enough entries",
        give: [{ kind: "length-at-least", n: 1 }, new Pairs([[1n, 2n]])],
        want: true,
      },
      {
        name: "length-at-least on a string of too few code points",
        give: [{ kind: "length-at-least", n: 2 }, "\u{1f600}"],
        want: false,
      },
      {
        name: "length-at-least on a byte string of enough bytes",
        give: [{ kind: "length-at-least", n: 2 }, Uint8Array.of(1, 2)],
        want: true,
      },
      {
        name: "length-at-least on a list of too few elements",
        give: [{ kind: "length-at-least", n: 3 }, [1n, 2n]],
        want: false,
      },
      {
        name: "length-at-least on a number",
        give: [{ kind: "length-at-least", n: 0 }, 5n],
        want: false,
      },
      {
        name: "contains on a list with an equal element",
        give: [{ kind: "contains", value: int(2) }, [1n, 2n]],
        want: true,
      },
      {
        name: "contains on a string with the text",
        give: [{ kind: "contains", value: { type: "string", value: "bc" } }, "abcd"],
        want: true,
      },
      {
        name: "contains on bytes with the run",
        give: [
          { kind: "contains", value: { type: "bytes", value: "0203" } },
          Uint8Array.of(1, 2, 3),
        ],
        want: true,
      },
      {
        name: "contains of an int on a string",
        give: [{ kind: "contains", value: int(2) }, "2"],
        want: false,
      },
      {
        name: "contains of a string on bytes",
        give: [
          { kind: "contains", value: { type: "string", value: "a" } },
          Uint8Array.of(97),
        ],
        want: false,
      },
      {
        name: "not-sorted on a descent",
        give: [{ kind: "not-sorted" }, [2n, 1n]],
        want: true,
      },
      {
        name: "not-sorted on strings out of code point order",
        give: [{ kind: "not-sorted" }, ["\u{10000}", "￿"]],
        want: true,
      },
      {
        name: "not-sorted on a longer string before its prefix",
        give: [{ kind: "not-sorted" }, ["ab", "a"]],
        want: true,
      },
      {
        name: "not-sorted on strings in order",
        give: [{ kind: "not-sorted" }, ["a", "ab", "b"]],
        want: false,
      },
      {
        name: "not-sorted on a value that is no list",
        give: [{ kind: "not-sorted" }, 1n],
        want: false,
      },
      {
        name: "has-duplicate on two equal elements",
        give: [{ kind: "has-duplicate" }, [1n, 2n, 1n]],
        want: true,
      },
      {
        name: "has-duplicate on distinct elements",
        give: [{ kind: "has-duplicate" }, [1n, 1]],
        want: false,
      },
      {
        name: "has-duplicate on a value that is no list",
        give: [{ kind: "has-duplicate" }, "aa"],
        want: false,
      },
      {
        name: "indexed-above on an indexed element above n",
        give: [{ kind: "indexed-above", n: 50 }, [10n, 60n, 1n]],
        want: true,
      },
      {
        name: "indexed-above on an indexed element at n",
        give: [{ kind: "indexed-above", n: 50 }, [50n, 0n]],
        want: false,
      },
      {
        name: "indexed-above on an index past the elements",
        give: [{ kind: "indexed-above", n: 50 }, [60n, 1n]],
        want: false,
      },
      {
        name: "indexed-above on a negative index",
        give: [{ kind: "indexed-above", n: 50 }, [60n, -1n]],
        want: false,
      },
      {
        name: "indexed-above on an index that is no integer",
        give: [{ kind: "indexed-above", n: 50 }, [60n, 0]],
        want: false,
      },
      {
        name: "indexed-above on an indexed element that is no number",
        give: [{ kind: "indexed-above", n: 50 }, ["x", 0n]],
        want: false,
      },
      {
        name: "indexed-above on an empty list",
        give: [{ kind: "indexed-above", n: 50 }, []],
        want: false,
      },
      {
        name: "indexed-above on a value that is no list",
        give: [{ kind: "indexed-above", n: 50 }, 1n],
        want: false,
      },
      {
        name: "a negated always on any value",
        give: [{ kind: "always", not: true }, 1n],
        want: false,
      },
    ];
    for (const tt of tests) {
      it(`returns a predicate that is ${tt.want} for ${tt.name}`, ({ seat }) => {
        const [spec, value] = tt.give;

        check.equal(seat, predicate(spec)(value), tt.want, "the verdict");
      });
    }

    const refusals = [
      {
        name: "a spec that is no object",
        give: [] as unknown,
        want: "prop: [] is no predicate",
      },
      { name: "null", give: null, want: "prop: null is no predicate" },
      {
        name: "an unknown kind",
        give: { kind: "odd" },
        want: 'prop: "odd" names no predicate',
      },
    ];
    for (const tt of refusals) {
      it(`throws for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => predicate(tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });
});
