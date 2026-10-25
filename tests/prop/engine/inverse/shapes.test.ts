// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the inverses of the generators of a shape file.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { SHAPES } from "../../../../src/prop/engine/inverse/shapes.js";
import { read } from "../../../../src/prop/engine/shape.js";
import { Fields, Variant } from "../../../../src/prop/engine/value.js";
import { test as it } from "../../../../src/vitest.js";
import { emittedBy, refusedBy } from "../../../helpers.js";

/** The shape of an unsigned 8-bit integer. */
const UINT8 = { shape: "int", width: 8, signed: false };

/** The shape of a record of one field, id. */
const RECORD = { shape: "record", fields: [["id", UINT8]] };

describe("shapes", () => {
  describe("SHAPES", () => {
    it("lists the classes of the generators of a shape file", ({ seat }) => {
      check.isEqualTo(
        seat,
        SHAPES.map(([kind]) => (kind as { name: string }).name),
        [
          "Root",
          "Ref",
          "RecordShape",
          "EnumShape",
          "Int128Shape",
          "InstantShape",
          "LocalDateTimeShape",
          "ZonedShape",
          "WallShape",
          "IpShape",
        ],
        "the classes",
      );
    });

    it("emits the steps of each field of a record", ({ seat }) => {
      const [steps, normal] = emittedBy(SHAPES, read(RECORD), new Fields([["id", 7n]]));

      check.isEqualTo(
        seat,
        [steps.map((s) => s.value), normal],
        [[7n], new Fields([["id", 7n]])],
        "the step of the id",
      );
    });

    it("refuses a record of other fields", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SHAPES, read(RECORD), new Fields([["x", 1n]])),
        'prop: record:["x"=int:1] is no record of id',
        "the refusal",
      );
    });

    it("emits the index of a variant", ({ seat }) => {
      const variants = {
        shape: "enum",
        variants: [
          ["a", null],
          ["b", null],
        ],
      };

      check.isEqualTo(
        seat,
        emittedBy(SHAPES, read(variants), new Variant("b"))[0].map((s) => s.value),
        [1n],
        "the index 1",
      );
    });

    it("refuses a payload of a variant without one", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(
          SHAPES,
          read({ shape: "enum", variants: [["a", null]] }),
          new Variant("a", 1n),
        ),
        "prop: the variant a has no payload",
        "the refusal",
      );
    });

    it("refuses units of an instant at seconds", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(
          SHAPES,
          read({ shape: "instant", unit: "s" }),
          new Fields([
            ["seconds", 0n],
            ["units", 1n],
          ]),
        ),
        "prop: an instant at seconds has no units, not int:1",
        "the refusal",
      );
    });

    it("refuses a value that is no record of two parts", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SHAPES, read({ shape: "instant", unit: "s" }), 0n),
        "prop: int:0 is no record of seconds and units",
        "the refusal",
      );
    });

    it("refuses a zoned value of a zone outside the list", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(
          SHAPES,
          read({ shape: "zoned-date-time", unit: "s" }),
          new Fields([
            ["instant", 0n],
            ["zone", "Mars/Olympus"],
          ]),
        ),
        'prop: string:"Mars/Olympus" is none of the values',
        "the refusal",
      );
    });

    it("refuses an address of five bytes", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SHAPES, read({ shape: "ip-address" }), new Uint8Array(5)),
        "prop: bytes:0000000000 is neither 4 nor 16 bytes",
        "the refusal",
      );
    });

    it("refuses a float for a 128-bit int", ({ seat }) => {
      check.isEqualTo(
        seat,
        refusedBy(SHAPES, read({ shape: "int", width: 128, signed: false }), 1.5),
        "prop: float:4609434218613702656 is no integer",
        "the refusal",
      );
    });
  });
});
