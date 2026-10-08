/** The spec of the namespace prop: the names that it exports, and the sentences that it registers. */

import { describe } from "vitest";
import { Failure, render } from "../../src/failure.js";
import { check } from "../../src/index.js";
import * as prop from "../../src/prop/index.js";
import { test as it } from "../../src/vitest.js";

/** The detail of a run that rejected every case. */
const REJECTED = {
  outcome: "rejected",
  cases: 0,
  rejected: 11,
  seed: "3",
  counterexample: null,
  failure: null,
  choices: null,
  others: null,
  divergence: null,
  coverage: null,
};

describe("index", () => {
  it("exports the names of the property engine", ({ seat }) => {
    check.equal(
      seat,
      Object.keys(prop).sort(),
      [
        "Case",
        "Generator",
        "accumulates",
        "boolean",
        "bytes",
        "cases",
        "closeTo",
        "composite",
        "contains",
        "containsInOrder",
        "dict",
        "doesNotThrow",
        "draws",
        "duration",
        "equal",
        "errorAs",
        "errorIs",
        "errorIsNot",
        "example",
        "examples",
        "explain",
        "float",
        "forAll",
        "fuzz",
        "hasError",
        "hasPrefix",
        "hasSuffix",
        "hermetic",
        "honoursCancellation",
        "honoursDeadline",
        "inRange",
        "integer",
        "isAssociative",
        "isCommutative",
        "isDeterministic",
        "isEmpty",
        "isFalse",
        "isIdempotent",
        "isNil",
        "isNotEmpty",
        "isNotNil",
        "isNotPure",
        "isPermutation",
        "isPure",
        "isTrue",
        "just",
        "length",
        "list",
        "matches",
        "maxChoices",
        "noError",
        "notContains",
        "notEqual",
        "nullHandleSafe",
        "of",
        "ofShape",
        "oneOf",
        "optional",
        "pairwise",
        "permutation",
        "recursive",
        "register",
        "registerValues",
        "registerVariants",
        "replay",
        "require",
        "roundTrip",
        "sampledFrom",
        "seed",
        "shapeOf",
        "shrink",
        "shrinkTime",
        "store",
        "string",
        "stringMatching",
        "throws",
        "using",
        "workers",
      ],
      "the names",
    );
  });

  const ids = ["prop-for-all", "prop-equal", "prop-round-trip"];
  for (const id of ids) {
    it(`registers the sentence of a run as the sentence of ${id}`, ({ seat }) => {
      check.equal(
        seat,
        render(new Failure(id, "every case passes", REJECTED)),
        "every case passes: rejected after 0 valid and 11 rejected cases, seed 3",
        "the sentence of the run",
      );
    });
  }
});
