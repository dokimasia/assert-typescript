// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the builders of the structural shapes. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  enumShape,
  listShape,
  mapShape,
  optionalShape,
  recordShape,
  refShape,
} from "../../../../src/prop/engine/shape/containers.js";
import { type Builder, Reader } from "../../../../src/prop/engine/shape/reader.js";
import { boolShape, intShape } from "../../../../src/prop/engine/shape/scalars.js";
import {
  EnumShape,
  ListShape,
  MapShape,
  OptionalShape,
  type RecordShape,
  Ref,
} from "../../../../src/prop/engine/shape/structure.js";
import { canonical, Pairs } from "../../../../src/prop/engine/value.js";
import { test as it } from "../../../../src/vitest.js";
import { decodeFrom, thrown } from "../../../helpers.js";

/** The builders of the shapes that the containers of this spec hold. */
const BUILDERS: ReadonlyMap<string, Builder> = new Map<string, Builder>([
  ["bool", boolShape],
  ["int", intShape],
]);

/** The reader that builds the elements of the containers of this spec. */
const READER = new Reader({ shape: "bool" }, new Map(), BUILDERS);

/** An unsigned 8-bit int. */
const UINT8 = { shape: "int", width: 8, signed: false };

describe("containers", () => {
  describe("listShape", () => {
    it("returns a list of the stated sizes", ({ seat }) => {
      const list = listShape(
        READER,
        { shape: "list", of: UINT8, max_size: 3 },
        "shape",
      );

      check.isEqualTo(
        seat,
        [
          list instanceof ListShape,
          (list as ListShape).unique,
          (list as ListShape).sizes.maxSize,
        ],
        [true, false, 3],
        "a list of at most 3 elements",
      );
    });

    it("returns a set, whose elements are unique", ({ seat }) => {
      const set = listShape(READER, { shape: "set", of: UINT8 }, "shape") as ListShape;

      check.isTrue(seat, set.unique, "unique elements");
    });

    it("returns a fixed-list of exactly its size", ({ seat }) => {
      const fixed = listShape(
        READER,
        { shape: "fixed-list", of: UINT8, size: 2 },
        "shape",
      ) as ListShape;

      check.isEqualTo(
        seat,
        [fixed.sizes.minSize, fixed.sizes.maxSize],
        [2, 2],
        "two elements",
      );
    });

    it("refuses a fixed-list without a size", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => listShape(READER, { shape: "fixed-list", of: UINT8 }, "shape")),
        "prop: shape is a fixed-list and states no size",
        "the refusal",
      );
    });
  });

  describe("mapShape", () => {
    it("returns a map from keys to values", ({ seat }) => {
      const map = mapShape(READER, { shape: "map", key: UINT8, of: UINT8 }, "shape");

      check.isEqualTo(
        seat,
        [map instanceof MapShape, canonical(decodeFrom(map, 1n, 1n, 2n, 0n)[0])],
        [true, canonical(new Pairs([[1n, 2n]]))],
        "one entry",
      );
    });
  });

  describe("optionalShape", () => {
    it("returns an optional of the stated shape", ({ seat }) => {
      const optional = optionalShape(READER, { shape: "optional", of: UINT8 }, "shape");

      check.isEqualTo(
        seat,
        [optional instanceof OptionalShape, decodeFrom(optional, 1n, 5n)[0]],
        [true, 5n],
        "a present value",
      );
    });
  });

  describe("recordShape", () => {
    it("returns a record of the stated fields in order", ({ seat }) => {
      const record = recordShape(
        READER,
        {
          shape: "record",
          fields: [
            ["id", UINT8],
            ["ok", { shape: "bool" }],
          ],
        },
        "shape",
      ) as RecordShape;

      check.isEqualTo(
        seat,
        record.fields.map(([name]) => name),
        ["id", "ok"],
        "the names of the fields",
      );
    });
  });

  describe("enumShape", () => {
    it("returns an enum whose variant without a payload states none", ({ seat }) => {
      const enumerated = enumShape(
        READER,
        {
          shape: "enum",
          variants: [
            ["none", null],
            ["some", UINT8],
          ],
        },
        "shape",
      ) as EnumShape;

      check.isEqualTo(
        seat,
        [
          enumerated instanceof EnumShape,
          enumerated.variants.map(([name, of]) => [name, of === undefined]),
        ],
        [
          true,
          [
            ["none", true],
            ["some", false],
          ],
        ],
        "a bare variant and a payload",
      );
    });
  });

  describe("refShape", () => {
    it("returns a ref to the named definition", ({ seat }) => {
      const ref = refShape(READER, { shape: "ref", name: "node" }) as Ref;

      check.isEqualTo(
        seat,
        [ref instanceof Ref, ref.name, ref.definitions === READER.built],
        [true, "node", true],
        "the name and the definitions of the reader",
      );
    });
  });
});
