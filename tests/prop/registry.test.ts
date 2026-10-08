/**
 * The spec of the registry of shape names. The registry is the test file's,
 * so the cases run in order: the registrations and the reads first, and the
 * close of the registry last.
 */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Case, Replaying } from "../../src/prop/engine/case.js";
import type { Choice } from "../../src/prop/engine/choice.js";
import type { Generator } from "../../src/prop/engine/generator.js";
import { integer } from "../../src/prop/generators.js";
import { drawnLiteral } from "../../src/prop/literal.js";
import {
  close,
  of,
  ofShape,
  register,
  registerValues,
  registerVariants,
  shapeOf,
} from "../../src/prop/registry.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** Returns the value that generator decodes from integer choices. */
function decoded(generator: Generator<unknown>, ...values: bigint[]): unknown {
  const choices: Choice[] = values.map((value) => ({ kind: "integer", value }));
  return new Case(new Replaying(choices)).draw(generator, "value");
}

/** The generator of the digits, which the registry keeps under Digit. */
const DIGIT = integer(0, 9);

describe("registry", () => {
  describe("register", () => {
    it("makes a generator the generator of a name", ({ seat }) => {
      register("Digit", DIGIT);

      check.equal(
        seat,
        of("Digit") === DIGIT,
        true,
        "of returns the registered generator",
      );
    });

    it("throws for a name that has a registration", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => register("Digit", DIGIT)),
        'prop: register("Digit") registers "Digit" a second time',
        "a second registration",
      );
    });

    it("throws a RangeError for an empty name", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => register("", DIGIT)),
        'prop: register("") names no shape',
        "no name",
      );
    });

    it("throws for a name that a read has looked up", ({ seat }) => {
      thrown(() => of("Late"));

      check.equal(
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

      check.equal(
        seat,
        [decoded(of("Color"), 0n), decoded(of("Color"), 2n)],
        ["red", { r: 1 }],
        "the first and the third value",
      );
    });

    it("runs a registered value back to its typed literal", ({ seat }) => {
      check.equal(
        seat,
        drawnLiteral(of("Color"), { r: 1 }),
        { type: "record", fields: [["r", { type: "int", value: 1 }]] },
        "the literal of the value",
      );
    });

    it("states a value that is none of the registered values by its own literal", ({
      seat,
    }) => {
      check.equal(
        seat,
        drawnLiteral(of("Color"), "blue"),
        { type: "string", value: "blue" },
        "the value's own literal, because the inverse refuses the value",
      );
    });

    it("throws a RangeError for no value", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => registerValues("None")),
        'prop: registerValues("None") states no value',
        "no value",
      );
    });

    it("throws a RangeError for a value that no typed literal states", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => registerValues("Callable", () => 1)),
        'prop: registerValues("Callable"): value 0 states no typed literal',
        "a function",
      );
    });

    it("throws a RangeError for two values of one typed literal", ({ seat }) => {
      check.equal(
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

      check.equal(
        seat,
        [decoded(of("Shape"), 0n, 1n), decoded(of("Shape"), 1n)],
        [{ name: "circle", payload: 2 }, { name: "empty" }],
        "a circle of radius 2, and the empty shape",
      );
    });

    it("generates a recursive enum through its own name", ({ seat }) => {
      registerVariants("Chain", { end: undefined, link: "Chain" });

      check.equal(
        seat,
        decoded(of("Chain"), 1n, 1n, 0n),
        { name: "link", payload: { name: "link", payload: { name: "end" } } },
        "a chain of two links",
      );
    });

    it("generates a variant's payload with a registered generator", ({ seat }) => {
      registerVariants("Box", { full: "Digit" });

      check.equal(
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
        check.equal(
          seat,
          thrown(() => registerVariants("Bad", tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("of", () => {
    it("returns one generator for two reads of a name", ({ seat }) => {
      const first = of("Shape");

      check.isTrue(
        seat,
        of("Shape") === first,
        "the second read returns the first read's generator",
      );
    });

    it("throws a RangeError for a name without a registration", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of("Nowhere")),
        'prop: of("Nowhere") names no registration',
        "no registration",
      );
    });

    it("throws a RangeError for a payload's name without a registration", ({
      seat,
    }) => {
      registerVariants("Broken", { some: "Missing" });

      check.equal(
        seat,
        thrown(() => of("Broken")),
        'prop: of("Broken"): "Missing" names no registration',
        "the payload's name",
      );
    });
  });

  describe("shapeOf", () => {
    it("returns the shape file of registered values with sorted keys", ({ seat }) => {
      check.equal(
        seat,
        shapeOf("Radius"),
        `${JSON.stringify(
          {
            shape: "literal",
            source: { language: "typescript", type: "Radius" },
            values: [
              { type: "int", value: 1 },
              { type: "int", value: 2 },
            ],
          },
          null,
          2,
        )}\n`,
        "a literal shape",
      );
    });

    it("returns the shape file of an enum with the definitions of its payloads", ({
      seat,
    }) => {
      const file = JSON.parse(shapeOf("Shape")) as Record<string, unknown>;

      check.equal(
        seat,
        file,
        {
          definitions: {
            Radius: {
              shape: "literal",
              values: [
                { type: "int", value: 1 },
                { type: "int", value: 2 },
              ],
            },
          },
          shape: "enum",
          source: { language: "typescript", type: "Shape" },
          variants: [
            ["circle", { name: "Radius", shape: "ref" }],
            ["empty", null],
          ],
        },
        "an enum shape",
      );
    });

    it("returns a recursive enum with its own definition", ({ seat }) => {
      const file = JSON.parse(shapeOf("Chain")) as {
        definitions: Record<string, unknown>;
      };

      check.equal(
        seat,
        Object.keys(file.definitions),
        ["Chain"],
        "the enum defines itself",
      );
    });

    it("throws for a name of a registered generator", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => shapeOf("Box")),
        'prop: shapeOf("Box"): "Digit" has a registered generator, which states no shape',
        "a generator states no shape",
      );
    });

    it("throws a RangeError for a name without a registration", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => shapeOf("Elsewhere")),
        'prop: shapeOf("Elsewhere"): "Elsewhere" names no registration',
        "no registration",
      );
    });
  });

  describe("ofShape", () => {
    it("returns the generator of a shape file whose ref names a registered name", ({
      seat,
    }) => {
      const generator = ofShape(
        JSON.stringify({
          shape: "record",
          fields: [["shape", { shape: "ref", name: "Shape" }]],
        }),
      );

      check.equal(
        seat,
        decoded(generator, 0n, 0n),
        { shape: { name: "circle", payload: 1 } },
        "a record of a circle",
      );
    });

    it("returns the generator of a shape file that defines a name as its own", ({
      seat,
    }) => {
      const generator = ofShape(
        JSON.stringify({
          shape: "ref",
          name: "Digit",
          definitions: { Digit: { shape: "int", width: 8, signed: false, max: 3 } },
        }),
      );

      check.equal(
        seat,
        decoded(generator, 3n),
        3,
        "the file's definition, not the registered generator",
      );
    });

    const tests = [
      {
        name: "text that is no JSON",
        give: "{",
        want: "prop: the shape file is no JSON:",
      },
      { name: "JSON that is no object", give: "[1]", want: "prop: [1] is not a shape" },
      {
        name: "a ref to a name of no registration",
        give: '{"shape": "ref", "name": "Absent"}',
        want: 'prop: a ref names "Absent", which is no definition',
      },
    ];
    for (const tt of tests) {
      it(`throws a ShapeError for ${tt.name}`, ({ seat }) => {
        check.hasPrefix(
          seat,
          thrown(() => ofShape(tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("close", () => {
    it("makes a later registration throw", ({ seat }) => {
      close();

      check.equal(
        seat,
        thrown(() => register("After", DIGIT)),
        'prop: register("After") follows the first property, which closed the registry',
        "the registry is closed",
      );
    });

    it("lets a read of a registered name follow it", ({ seat }) => {
      check.equal(
        seat,
        decoded(ofShape('{"shape": "ref", "name": "Radius"}'), 1n),
        2,
        "the second radius",
      );
    });
  });
});
