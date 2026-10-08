/** The spec of strict JSON, as a store file must be. */

import { describe } from "vitest";
import { check, prop } from "../../../src/index.js";
import { JsonError, parse } from "../../../src/prop/engine/json.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

describe("json", () => {
  describe("new JsonError", () => {
    it("returns the error of a text", ({ seat }) => {
      const err = new JsonError("prop: the JSON at 0: no value starts here");

      check.equal(
        seat,
        [err.name, err.message],
        ["JsonError", "prop: the JSON at 0: no value starts here"],
        "the name and the message",
      );
    });
  });

  describe("parse", () => {
    const tests = [
      { name: "an integer as a bigint", give: "-12", want: -12n as unknown },
      { name: "a number with a fraction as a number", give: "1.0", want: 1 },
      { name: "a number with an exponent as a number", give: "2e3", want: 2000 },
      {
        name: "the three words",
        give: "[true, false, null]",
        want: [true, false, null],
      },
      { name: "an empty array", give: " [ ] ", want: [] },
      { name: "nested arrays", give: "[[1], [2, [3]]]", want: [[1n], [2n, [3n]]] },
      {
        name: "a string with every escape",
        give: '"\\"\\\\\\/\\b\\f\\n\\r\\t\\u00e9"',
        want: '"\\/\b\f\n\r\té',
      },
    ];
    for (const tt of tests) {
      it(`reads ${tt.name}`, ({ seat }) => {
        check.equal(seat, parse(tt.give, 4), tt.want, "the value");
      });
    }

    it("reads an object without a prototype", ({ seat }) => {
      const value = parse('{ "a" : 1, "b": {} }', 4) as Record<string, unknown>;

      check.equal(
        seat,
        [
          Object.getPrototypeOf(value),
          Object.keys(value),
          value["a"],
          Object.keys(value["b"] as object),
        ],
        [null, ["a", "b"], 1n, []],
        "two names",
      );
    });

    it("reads a name that Object.prototype has as a name of its own", ({ seat }) => {
      const value = parse('{"toString": 1}', 4) as Record<string, unknown>;

      check.equal(seat, value["toString"], 1n, "the stated value");
    });

    it("reads objects and arrays down to the most levels", ({ seat }) => {
      check.equal(seat, parse("[[[]]]", 3), [[[]]], "three levels");
    });

    const refusals = [
      {
        name: "a text without a value",
        give: "",
        want: "prop: the JSON at 0: no value starts here",
      },
      {
        name: "a text that continues after its value",
        give: "1 2",
        want: "prop: the JSON at 2: the text continues after its value",
      },
      {
        name: "a value past the most levels",
        give: "[[[[]]]]",
        want: "prop: the JSON at 3: the value nests past 3 levels",
      },
      {
        name: "a repeated name",
        give: '{"a": 1, "a": 2}',
        want: 'prop: the JSON at 12: an object repeats the name "a"',
      },
      {
        name: "a name that is no string",
        give: "{1: 2}",
        want: "prop: the JSON at 1: an object states a name that is no string",
      },
      {
        name: "a name without a colon",
        give: '{"a" 1}',
        want: "prop: the JSON at 5: a name is not followed by a colon",
      },
      {
        name: "an object that is not closed",
        give: '{"a": 1',
        want: "prop: the JSON at 8: an object is not closed",
      },
      {
        name: "an array that is not closed",
        give: "[1 2",
        want: "prop: the JSON at 4: an array is not closed",
      },
      {
        name: "a string that is not closed",
        give: '"ab',
        want: "prop: the JSON at 3: a string is not closed",
      },
      {
        name: "a control character in a string",
        give: '"a\tb"',
        want: "prop: the JSON at 3: a string contains a control character",
      },
      {
        name: "an unknown escape",
        give: '"\\x"',
        want: "prop: the JSON at 3: a string states a malformed escape",
      },
      {
        name: "a short unicode escape",
        give: '"\\u12"',
        want: "prop: the JSON at 3: a string states a malformed escape",
      },
      {
        name: "a number with a leading zero",
        give: "01",
        want: "prop: the JSON at 1: the text continues after its value",
      },
      {
        name: "a word that is cut short",
        give: "tru",
        want: "prop: the JSON at 0: no value starts here",
      },
    ];
    for (const tt of refusals) {
      it(`throws a JsonError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => parse(tt.give, 3)),
          tt.want,
          "the refusal",
        );
      });
    }

    it("throws nothing but a JsonError for any text", async ({ seat }) => {
      await prop.fuzz(seat, "parse throws nothing but a JsonError", (c) => {
        const text = c.draw(prop.bytes(), "text");
        try {
          parse(Buffer.from(text).toString("latin1"), 3);
        } catch (err) {
          check.errorIs(c, err, JsonError, "the refusal is a JsonError");
        }
      });
    });
  });
});
