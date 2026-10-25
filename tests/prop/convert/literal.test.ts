// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the TypeScript values of decoded literals. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { literalOf, plainOf } from "../../../src/prop/convert/literal.js";
import { Fields, Pairs, Variant } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

describe("literal", () => {
  describe("plainOf", () => {
    it("converts every engine container in a value to its TypeScript form", ({
      seat,
    }) => {
      const value = [
        new Fields([["a", 1n]]),
        new Pairs([["k", new Variant("none")]]),
        new Variant("some", [2n]),
      ];

      check.isEqualTo(
        seat,
        plainOf(value),
        [
          { a: 1n },
          new Map([["k", { name: "none" }]]),
          { name: "some", payload: [2n] },
        ],
        "the TypeScript values",
      );
    });
  });

  describe("literalOf", () => {
    it("converts a decoded value to its TypeScript form", ({ seat }) => {
      const converter = literalOf([new Fields([["a", 1n]])]);

      check.isEqualTo(
        seat,
        converter.to(new Fields([["a", 1n]])),
        { a: 1n },
        "the plain object",
      );
    });

    it("converts either form back to the decoded value", ({ seat }) => {
      const decoded = new Fields([["a", 1n]]);
      const converter = literalOf([decoded]);

      check.isEqualTo(
        seat,
        [converter.back({ a: 1n }), converter.back(new Fields([["a", 1n]]))],
        [decoded, decoded],
        "the decoded value of each form",
      );
    });

    it("refuses a value that is none of the literal's values", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => literalOf([1n]).back(2n)),
        "prop: 2n is no value of the literal shape",
        "the refusal",
      );
    });
  });
});
