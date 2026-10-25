// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the reader of a shape file: its checks of keys and refs, and its builds. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { Bool, Just } from "../../../../src/prop/engine/generator.js";
import {
  enumShape,
  listShape,
  optionalShape,
  recordShape,
  refShape,
} from "../../../../src/prop/engine/shape/containers.js";
import { type Builder, Reader } from "../../../../src/prop/engine/shape/reader.js";
import { boolShape, intShape } from "../../../../src/prop/engine/shape/scalars.js";
import { Ref, Root } from "../../../../src/prop/engine/shape/structure.js";
import { test as it } from "../../../../src/vitest.js";
import { decodeFrom, thrown } from "../../../helpers.js";

/** The builders of the shapes that this spec reads. */
const BUILDERS: ReadonlyMap<string, Builder> = new Map<string, Builder>([
  ["bool", boolShape],
  ["int", intShape],
  ["list", listShape],
  ["optional", optionalShape],
  ["record", recordShape],
  ["enum", enumShape],
  ["ref", refShape],
]);

/** A list of nodes, each a list of nodes, whose list can always be empty. */
const NESTED = {
  shape: "ref",
  name: "node",
  definitions: { node: { shape: "list", of: { shape: "ref", name: "node" } } },
};

/** Returns the reader of document with the builders of this spec. */
function readerOf(document: Record<string, unknown>): Reader {
  return new Reader(document, new Map(), BUILDERS);
}

describe("reader", () => {
  describe("Reader.root", () => {
    it("returns the generator of a shape without a cyclic definition", ({ seat }) => {
      check.isTrue(seat, readerOf({ shape: "bool" }).root() instanceof Bool, "a bool");
    });

    it("returns a root around a shape with a cyclic definition", ({ seat }) => {
      check.isTrue(seat, readerOf(NESTED).root() instanceof Root, "a root");
    });

    it("decodes a ref to a name that the file does not define with its external generator", ({
      seat,
    }) => {
      const reader = new Reader(
        { shape: "ref", name: "x" },
        new Map([["x", new Just(7)]]),
        BUILDERS,
      );
      const root = reader.root();

      check.isEqualTo(
        seat,
        [root instanceof Ref, decodeFrom(root)[0]],
        [true, 7],
        "the external value",
      );
    });

    const tests = [
      {
        name: "definitions that are no map",
        give: { shape: "bool", definitions: [] },
        want: "prop: definitions is not a map of names to shapes",
      },
      {
        name: "a definition that is no shape",
        give: { shape: "bool", definitions: { a: 1 } },
        want: "prop: definitions.a is 1, not a shape",
      },
      {
        name: "a source without a language and a type",
        give: { shape: "bool", source: { language: "go" } },
        want: 'prop: source is {"language":"go"}, not a language and a type',
      },
      {
        name: "a ref to no definition",
        give: { shape: "ref", name: "x" },
        want: 'prop: a ref names "x", which is no definition',
      },
      {
        name: "a definition without a finite value",
        give: {
          shape: "ref",
          name: "a",
          definitions: {
            a: { shape: "record", fields: [["next", { shape: "ref", name: "a" }]] },
          },
        },
        want: "prop: definitions.a has no finite value, because it refers back without an optional, a list, a set, a map or an enum that can exit",
      },
    ];
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => readerOf(tt.give).root()),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("Reader.refs", () => {
    const list = { shape: "list", of: { shape: "ref", name: "a" } };

    it("returns the name of every ref inside a node", ({ seat }) => {
      check.isEqualTo(seat, readerOf(list).refs(list), ["a"], "one ref");
    });

    it("does not enter a container that can always exit with stopAtExits", ({
      seat,
    }) => {
      check.isEqualTo(seat, readerOf(list).refs(list, true), [], "no ref");
    });
  });

  describe("Reader.refersBack", () => {
    it("reports whether a node refers to a cyclic definition", ({ seat }) => {
      const reader = readerOf(NESTED);
      reader.root();

      check.isEqualTo(
        seat,
        [
          reader.refersBack({ shape: "ref", name: "node" }),
          reader.refersBack({ shape: "bool" }),
        ],
        [true, false],
        "the ref alone",
      );
    });
  });

  describe("Reader.exits", () => {
    const tests = [
      { name: "an optional", give: { shape: "optional" }, want: true },
      { name: "a list without a minimum size", give: { shape: "list" }, want: true },
      {
        name: "a list with a minimum size of 0",
        give: { shape: "list", min_size: 0 },
        want: true,
      },
      {
        name: "a list with a minimum size of 1",
        give: { shape: "list", min_size: 1 },
        want: false,
      },
      { name: "a record", give: { shape: "record" }, want: false },
      {
        name: "an enum with a variant that does not refer back",
        give: { shape: "enum", variants: [["leaf", null]] },
        want: true,
      },
    ];
    for (const tt of tests) {
      it(`reports ${tt.want} for ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          readerOf({ shape: "bool" }).exits(tt.give),
          tt.want,
          "the exit",
        );
      });
    }
  });

  describe("Reader.exitVariant", () => {
    it("returns the index of the first variant that does not refer back", ({
      seat,
    }) => {
      const reader = readerOf(NESTED);
      reader.root();
      const variants = [
        ["branch", { shape: "ref", name: "node" }],
        ["leaf", null],
      ];

      check.isEqualTo(
        seat,
        [
          reader.exitVariant({ shape: "enum", variants }),
          reader.exitVariant({ shape: "enum", variants: variants.slice(0, 1) }),
        ],
        [1, undefined],
        "the leaf, and no exit",
      );
    });
  });

  describe("Reader.build", () => {
    const tests = [
      {
        name: "a node of no shape",
        give: { shape: "widget" },
        want: 'prop: shape is "widget", which is no shape',
      },
      {
        name: "a node without a key that its shape needs",
        give: { shape: "list" },
        want: "prop: shape states no of, which the list shape needs",
      },
      {
        name: "a node with a key that its shape does not take",
        give: { shape: "bool", min: 1 },
        want: "prop: shape.min does not apply to the bool shape",
      },
    ];
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => readerOf({ shape: "bool" }).build(tt.give, "shape")),
          tt.want,
          "the refusal",
        );
      });
    }

    it("throws a ShapeError with the error of a builder as its cause", ({ seat }) => {
      const boom = new RangeError("boom");
      const failing = new Map<string, Builder>([
        [
          "bool",
          () => {
            throw boom;
          },
        ],
      ]);
      let caught: unknown;
      try {
        new Reader({ shape: "bool" }, new Map(), failing).build(
          { shape: "bool" },
          "shape",
        );
      } catch (err) {
        caught = err;
      }

      check.isEqualTo(
        seat,
        [(caught as Error).message, (caught as Error).cause],
        ["prop: shape: boom", boom],
        "the message and the cause",
      );
    });
  });

  describe("Reader.child", () => {
    it("refuses a nested node that is no shape", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => readerOf({ shape: "bool" }).child(1, "shape.of")),
        "prop: shape.of is 1, not a shape",
        "the refusal",
      );
    });
  });
});
