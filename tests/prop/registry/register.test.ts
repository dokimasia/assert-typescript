// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the registrations of shape names. The registry is the test
 * file's, so the cases run in order, and a later case reads the names that
 * an earlier case registered.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Replaying } from "../../../src/prop/engine/case/providers.js";
import { Case } from "../../../src/prop/engine/case.js";
import type { Choice } from "../../../src/prop/engine/choice.js";
import type { Generator } from "../../../src/prop/engine/generator.js";
import { integer } from "../../../src/prop/generators.js";
import { drawnLiteral } from "../../../src/prop/literal.js";
import {
  register,
  registerValues,
  registerVariants,
} from "../../../src/prop/registry/register.js";
import { of } from "../../../src/prop/registry.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** Returns the value that generator decodes from integer choices. */
function decoded(generator: Generator<unknown>, ...values: bigint[]): unknown {
  const choices: Choice[] = values.map((value) => ({ kind: "integer", value }));
  return new Case(new Replaying(choices)).draw(generator, "value");
}

/** The generator of the digits, which the registry keeps under Digit. */
const DIGIT = integer(0, 9);

describe("register", () => {
  describe("register", () => {
    it("makes a generator the generator of a name", ({ seat }) => {
      register("Digit", DIGIT);

      check.isEqualTo(
        seat,
        of("Digit") === DIGIT,
        true,
        "of returns the registered generator",
      );
    });

    it("throws for a name that has a registration", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => register("Digit", DIGIT)),
        'prop: register("Digit") registers "Digit" a second time',
        "a second registration",
      );
    });

    it("throws a RangeError for an empty name", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => register("", DIGIT)),
        'prop: register("") names no shape',
        "no name",
      );
    });

    it("throws for a name that a read has looked up", ({ seat }) => {
      thrown(() => of("Late"));

      check.isEqualTo(
        seat,
        thrown(() => register("Late", DIGIT)),
        'prop: register("Late") follows a read of "Late", whose generators would not see it',
        "a registration after a read",
      );
    });
  });

  describe("registerValues", () => {
    it("makes the shape of a name a literal over the values that its generator returns", ({
      seat,
    }) => {
      registerValues<unknown>("Color", "red", "green", { r: 1 });

      check.isEqualTo(
        seat,
        [decoded(of("Color"), 0n), decoded(of("Color"), 2n)],
        ["red", { r: 1 }],
        "the first and the third value",
      );
    });

    it("runs a registered value back to its typed literal", ({ seat }) => {
      check.isEqualTo(
        seat,
        drawnLiteral(of("Color"), { r: 1 }),
        { type: "record", fields: [["r", { type: "int", value: 1 }]] },
        "the literal of the value",
      );
    });

    it("states a value that is none of the registered values by its own literal", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        drawnLiteral(of("Color"), "blue"),
        { type: "string", value: "blue" },
        "the value's own literal, because the inverse refuses the value",
      );
    });

    it("throws a RangeError for no value", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => registerValues("None")),
        'prop: registerValues("None") states no value',
        "no value",
      );
    });

    it("throws a RangeError for a value that no typed literal states", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => registerValues("Callable", () => 1)),
        'prop: registerValues("Callable"): value 0 states no typed literal',
        "a function",
      );
    });

    it("throws a RangeError for two values of one typed literal", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => registerValues<unknown>("Twice", 1, 1n)),
        'prop: registerValues("Twice"): values 0 and 1 state one typed literal',
        "1 and 1n",
      );
    });
  });

  describe("registerVariants", () => {
    it("makes the shape of a name an enum of the variants with the generators of their payloads", ({
      seat,
    }) => {
      registerValues("Radius", 1, 2);
      registerVariants("Shape", { circle: "Radius", empty: undefined });

      check.isEqualTo(
        seat,
        [decoded(of("Shape"), 0n, 1n), decoded(of("Shape"), 1n)],
        [{ name: "circle", payload: 2 }, { name: "empty" }],
        "a circle of radius 2, and the empty shape",
      );
    });

    it("generates a recursive enum through its own name", ({ seat }) => {
      registerVariants("Chain", { end: undefined, link: "Chain" });

      check.isEqualTo(
        seat,
        decoded(of("Chain"), 1n, 1n, 0n),
        { name: "link", payload: { name: "link", payload: { name: "end" } } },
        "a chain of two links",
      );
    });

    it("generates a variant's payload with a registered generator", ({ seat }) => {
      registerVariants("Box", { full: "Digit" });

      check.isEqualTo(
        seat,
        decoded(of("Box"), 0n, 7n),
        { name: "full", payload: 7 },
        "a box of 7",
      );
    });

    const tests = [
      {
        name: "no variant",
        give: {},
        want: 'prop: registerVariants("Bad") states no variant',
      },
      {
        name: "a variant without a name",
        give: { "": undefined },
        want: 'prop: registerVariants("Bad") states a variant without a name',
      },
      {
        name: "a payload's empty name",
        give: { some: "" },
        want: 'prop: registerVariants("Bad"): the variant "some" names no payload shape',
      },
      {
        name: "a payload's name that is no string",
        give: { some: 5 as unknown as string },
        want: 'prop: registerVariants("Bad"): the variant "some" names no payload shape',
      },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => registerVariants("Bad", tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });
});
