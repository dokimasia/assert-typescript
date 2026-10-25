// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the reads of the registry of shape names. The registry is the
 * test file's: the spec registers its names first, the cases run in order,
 * and the close of the registry is last.
 */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Replaying } from "../../src/prop/engine/case/providers.js";
import { Case } from "../../src/prop/engine/case.js";
import type { Choice } from "../../src/prop/engine/choice.js";
import type { Generator } from "../../src/prop/engine/generator.js";
import { integer } from "../../src/prop/generators.js";
import {
  register,
  registerValues,
  registerVariants,
} from "../../src/prop/registry/register.js";
import { close, of, ofShape, shapeOf } from "../../src/prop/registry.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** Returns the value that generator decodes from integer choices. */
function decoded(generator: Generator<unknown>, ...values: bigint[]): unknown {
  const choices: Choice[] = values.map((value) => ({ kind: "integer", value }));
  return new Case(new Replaying(choices)).draw(generator, "value");
}

/** The generator of the digits, which the registry keeps under Digit. */
const DIGIT = integer(0, 9);

register("Digit", DIGIT);
registerValues("Radius", 1, 2);
registerVariants("Shape", { circle: "Radius", empty: undefined });
registerVariants("Chain", { end: undefined, link: "Chain" });
registerVariants("Box", { full: "Digit" });

describe("registry", () => {
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
      check.isEqualTo(
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

      check.isEqualTo(
        seat,
        thrown(() => of("Broken")),
        'prop: of("Broken"): "Missing" names no registration',
        "the payload's name",
      );
    });
  });

  describe("shapeOf", () => {
    it("returns the shape file of registered values with sorted keys", ({ seat }) => {
      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
        seat,
        Object.keys(file.definitions),
        ["Chain"],
        "the enum defines itself",
      );
    });

    it("throws for a name of a registered generator", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => shapeOf("Box")),
        'prop: shapeOf("Box"): "Digit" has a registered generator, which states no shape',
        "a generator states no shape",
      );
    });

    it("throws a RangeError for a name without a registration", ({ seat }) => {
      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
        seat,
        thrown(() => register("After", DIGIT)),
        'prop: register("After") follows the first property, which closed the registry',
        "the registry is closed",
      );
    });

    it("lets a read of a registered name follow it", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(ofShape('{"shape": "ref", "name": "Radius"}'), 1n),
        2,
        "the second radius",
      );
    });
  });
});
