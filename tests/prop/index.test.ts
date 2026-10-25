// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

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
  reason: null,
};

describe("index", () => {
  it("exports the names of the property engine", ({ seat }) => {
    check.isEqualTo(
      seat,
      Object.keys(prop).sort(),
      [
        "Case",
        "Generator",
        "accumulates",
        "around",
        "boolean",
        "bytes",
        "cases",
        "composite",
        "containsInOrder",
        "dict",
        "doesContain",
        "doesMatch",
        "doesNotContain",
        "doesNotThrow",
        "doesThrow",
        "draws",
        "duration",
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
        "hasLength",
        "hasPrefix",
        "hasSuffix",
        "hermetic",
        "honoursCancellation",
        "honoursDeadline",
        "inRange",
        "integer",
        "isAssociative",
        "isCloseTo",
        "isCommutative",
        "isDeterministic",
        "isEmpty",
        "isEqualTo",
        "isFalse",
        "isIdempotent",
        "isNil",
        "isNotEmpty",
        "isNotEqualTo",
        "isNotNil",
        "isNotPure",
        "isPermutation",
        "isPure",
        "isTrue",
        "just",
        "list",
        "maxChoices",
        "noError",
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
        "using",
        "values",
        "workers",
      ],
      "the names",
    );
  });

  const ids = ["prop-for-all", "prop-equal", "prop-round-trip"];
  for (const id of ids) {
    it(`registers the sentence of a run as the sentence of ${id}`, ({ seat }) => {
      check.isEqualTo(
        seat,
        render(new Failure(id, "every case passes", REJECTED)),
        "every case passes: rejected after 0 valid and 11 rejected cases, seed 3",
        "the sentence of the run",
      );
    });
  }
});
