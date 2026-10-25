// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the builders of the scalar shapes, and of the generator of an IP address. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { SequenceBounds } from "../../../../src/prop/engine/choice.js";
import {
  Bool,
  Bytes,
  Float,
  Integer,
  Matching,
  SampledFrom,
  Text,
} from "../../../../src/prop/engine/generator.js";
import { Int128Shape } from "../../../../src/prop/engine/shape/pair.js";
import { Reader } from "../../../../src/prop/engine/shape/reader.js";
import {
  boolShape,
  bytesShape,
  charShape,
  decimalShape,
  floatShape,
  IpShape,
  intShape,
  ipShape,
  literalShape,
  stringShape,
  uuidShape,
} from "../../../../src/prop/engine/shape/scalars.js";
import { test as it } from "../../../../src/vitest.js";
import { decodeFrom, thrown } from "../../../helpers.js";

/** A reader, which no builder of a scalar shape reads. */
const READER = new Reader({ shape: "bool" }, new Map(), new Map());

/** Returns the id of the bounds of a generator that has them. */
function idOf(generator: unknown): string {
  return (generator as { readonly bounds: { readonly id: string } }).bounds.id;
}

describe("scalars", () => {
  describe("IpShape", () => {
    it("decodes the bytes of the version that an index chooses", ({ seat }) => {
      const ip = new IpShape([
        new Bytes(new SequenceBounds(256, 4, 4)),
        new Bytes(new SequenceBounds(256, 16, 16)),
      ]);

      check.isEqualTo(
        seat,
        decodeFrom(ip, 1n, new Array<number>(16).fill(1))[0],
        new Uint8Array(16).fill(1),
        "an address of version 6",
      );
    });
  });

  describe("boolShape", () => {
    it("returns a bool of even odds", ({ seat }) => {
      const bool = boolShape();

      check.isEqualTo(
        seat,
        [bool instanceof Bool, (bool as Bool).p],
        [true, { num: 1n, den: 2n }],
        "1 in 2",
      );
    });
  });

  describe("uuidShape", () => {
    it("returns exactly 16 bytes", ({ seat }) => {
      check.isEqualTo(seat, idOf(uuidShape()), "sequence 256 16 16", "16 bytes");
    });
  });

  describe("intShape", () => {
    it("returns an integer of the range of its width and signedness", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          idOf(intShape(READER, { width: 8, signed: true }, "shape")),
          idOf(intShape(READER, { width: 16, signed: false, min: 3 }, "shape")),
        ],
        ["integer -128 127", "integer 3 65535"],
        "two ranges",
      );
    });

    it("returns a 128-bit integer for the width 128", ({ seat }) => {
      check.isTrue(
        seat,
        intShape(READER, { width: 128, signed: false }, "shape") instanceof Int128Shape,
        "two halves",
      );
    });

    it("refuses a width that is no power of two from 8 to 128", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => intShape(READER, { width: 12, signed: true }, "shape")),
        "prop: shape states width 12 and signed true",
        "the refusal",
      );
    });
  });

  describe("floatShape", () => {
    it("returns a float of the finite range of its width by default", ({ seat }) => {
      const float = floatShape(READER, { width: 64 }, "shape");

      check.isEqualTo(
        seat,
        [float instanceof Float, idOf(float)],
        [true, `float ${-Number.MAX_VALUE} ${Number.MAX_VALUE} false 64`],
        "the finite doubles",
      );
    });

    const tests = [
      {
        name: "a width other than 32 and 64",
        give: { width: 16 },
        want: "prop: shape.width is 16, not 32 or 64",
      },
      {
        name: "an allow_nan that is no boolean",
        give: { width: 32, allow_nan: 1 },
        want: "prop: shape states allow_nan or allow_infinity as no boolean",
      },
      {
        name: "the infinities with both bounds",
        give: { width: 32, allow_infinity: true, min: 0, max: 1 },
        want: "prop: shape allows the infinities and bounds out both",
      },
    ];
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => floatShape(READER, tt.give, "shape")),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("charShape", () => {
    it("returns one character of the stated alphabet", ({ seat }) => {
      const char = charShape(READER, { alphabet: "ab" }, "shape");

      check.isEqualTo(
        seat,
        [char instanceof Text, (char as Text).characters, idOf(char)],
        [true, ["a", "b"], "sequence 2 1 1"],
        "one of two characters",
      );
    });
  });

  describe("stringShape", () => {
    it("returns a string of the stated sizes over the alphabet", ({ seat }) => {
      check.isEqualTo(
        seat,
        idOf(stringShape(READER, { alphabet: "ab", max_size: 3 }, "shape")),
        "sequence 2 0 3",
        "up to three characters",
      );
    });

    it("returns a string that matches a stated pattern", ({ seat }) => {
      check.isTrue(
        seat,
        stringShape(READER, { pattern: "a+" }, "shape") instanceof Matching,
        "a matching string",
      );
    });

    const tests = [
      {
        name: "a pattern with an alphabet",
        give: { pattern: "a", alphabet: "a" },
        want: "prop: shape states a pattern and an alphabet or a size",
      },
      {
        name: "a pattern that is no string",
        give: { pattern: 1 },
        want: "prop: shape.pattern is 1, not a pattern",
      },
    ];
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => stringShape(READER, tt.give, "shape")),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("bytesShape", () => {
    it("returns bytes of the stated sizes", ({ seat }) => {
      check.isEqualTo(
        seat,
        idOf(bytesShape(READER, { min_size: 1, max_size: 2 }, "shape")),
        "sequence 256 1 2",
        "one or two bytes",
      );
    });
  });

  describe("literalShape", () => {
    it("returns one of the values that the literals state", ({ seat }) => {
      const literal = literalShape(
        READER,
        {
          values: [
            { type: "int", value: 1 },
            { type: "string", value: "a" },
          ],
        },
        "shape",
      );

      check.isEqualTo(
        seat,
        [literal instanceof SampledFrom, (literal as SampledFrom<unknown>).values],
        [true, [1n, "a"]],
        "two values",
      );
    });

    it("refuses an empty list of literals", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => literalShape(READER, { values: [] }, "shape")),
        "prop: shape.values is [], not a list of literals",
        "the refusal",
      );
    });
  });

  describe("ipShape", () => {
    it("returns the bytes of the stated version", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          idOf(ipShape(READER, { version: 4 }, "shape")),
          idOf(ipShape(READER, { version: 6 }, "shape")),
          ipShape(READER, {}, "shape") instanceof IpShape,
        ],
        ["sequence 256 4 4", "sequence 256 16 16", true],
        "4 bytes, 16 bytes, and either version",
      );
    });

    it("refuses a version other than 4 and 6", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => ipShape(READER, { version: 5 }, "shape")),
        "prop: shape.version is 5, not 4 or 6",
        "the refusal",
      );
    });
  });

  describe("decimalShape", () => {
    it("returns the unscaled integers between the bounds, rounded inward", ({
      seat,
    }) => {
      const decimal = decimalShape(
        READER,
        { scale: 2, min: "-1.005", max: "2.999" },
        "shape",
      );

      check.isEqualTo(
        seat,
        [decimal instanceof Integer, idOf(decimal)],
        [true, "integer -100 299"],
        "the cents from -1.00 to 2.99",
      );
    });

    const tests = [
      {
        name: "a decimal without a scale",
        give: {},
        want: "prop: shape is a decimal and states no scale",
      },
      {
        name: "a bound that is no decimal",
        give: { scale: 1, min: "1e3" },
        want: 'prop: shape.min is "1e3", not a decimal',
      },
    ];
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => decimalShape(READER, tt.give, "shape")),
          tt.want,
          "the refusal",
        );
      });
    }
  });
});
