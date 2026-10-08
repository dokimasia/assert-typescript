/** The spec of the typed literal of a drawn value, as its generator states the value's type. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { IntegerBounds, SequenceBounds } from "../../src/prop/engine/choice.js";
import { Sizes } from "../../src/prop/engine/collection.js";
import {
  Bool,
  Bytes,
  Dict,
  Integer,
  Mapped,
  Text,
} from "../../src/prop/engine/generator.js";
import { read } from "../../src/prop/engine/shape.js";
import { Fields, Pairs, Variant } from "../../src/prop/engine/value.js";
import {
  boolean,
  dict,
  float,
  integer,
  list,
  optional,
  string,
} from "../../src/prop/generators.js";
import { drawnLiteral } from "../../src/prop/literal.js";
import { test as it } from "../../src/vitest.js";

/** The generator of the integers 0 to 9, as the engine decodes them. */
const DIGIT = new Integer(new IntegerBounds(0n, 9n));

describe("literal", () => {
  describe("drawnLiteral", () => {
    it("returns the int of a number that integer drew", ({ seat }) => {
      check.equal(
        seat,
        drawnLiteral(integer(0, 9), 3),
        { type: "int", value: 3 },
        "an int",
      );
    });

    it("returns the float of an integral number that float drew", ({ seat }) => {
      check.equal(
        seat,
        drawnLiteral(float(0, 9), 3),
        { type: "float", value: 3 },
        "a float",
      );
    });

    it("returns the literal of the value's own type for a map without an inverse", ({
      seat,
    }) => {
      const doubled = integer(0, 9).map((x) => x * 2);

      check.equal(
        seat,
        drawnLiteral(doubled, 6),
        { type: "int", value: 6 },
        "the library's literal",
      );
    });

    it("returns the literal of the value's own type for a map whose inverse throws", ({
      seat,
    }) => {
      const refusing = new Mapped(
        DIGIT,
        (x: bigint) => x,
        () => {
          throw new TypeError("no");
        },
      );

      check.equal(
        seat,
        drawnLiteral(refusing, 4n),
        { type: "int", value: 4 },
        "the library's literal",
      );
    });

    it("returns the literal of a filter's value through the generator it filters", ({
      seat,
    }) => {
      const even = integer(0, 9).filter((x) => x % 2 === 0);

      check.equal(seat, drawnLiteral(even, 4), { type: "int", value: 4 }, "an int");
    });

    it("returns null for an absent optional value", ({ seat }) => {
      check.equal(
        seat,
        drawnLiteral(optional(boolean()), undefined),
        { type: "null" },
        "null",
      );
    });

    it("returns the literal of a present optional value", ({ seat }) => {
      check.equal(
        seat,
        drawnLiteral(optional(boolean()), true),
        { type: "bool", value: true },
        "a bool",
      );
    });

    it("returns a list of one scalar type", ({ seat }) => {
      check.equal(
        seat,
        drawnLiteral(list(integer(0, 9)), [1, 2]),
        { type: "list", of: "int", value: [1, 2] },
        "the scalar form",
      );
    });

    it("returns a list of item literals for elements that are no scalars", ({
      seat,
    }) => {
      check.equal(
        seat,
        drawnLiteral(list(list(boolean())), [[true]]),
        { type: "list", items: [{ type: "list", of: "bool", value: [true] }] },
        "the items form",
      );
    });

    it("returns an empty list as items", ({ seat }) => {
      check.equal(
        seat,
        drawnLiteral(list(boolean()), []),
        { type: "list", items: [] },
        "no element",
      );
    });

    it("returns undefined for a list with an element that no literal states", ({
      seat,
    }) => {
      const functions = list(integer(0, 9).map(() => () => 1));

      check.isNil(
        seat,
        drawnLiteral(functions, [() => 1]),
        "a function has no literal",
      );
    });

    it("returns the literal of the value's own type for a non-list value of a list's generator", ({
      seat,
    }) => {
      check.equal(
        seat,
        drawnLiteral(list(boolean()), "x"),
        { type: "string", value: "x" },
        "a string",
      );
    });

    it("returns the entries of a map through the dict's generators", ({ seat }) => {
      const generator = new Dict(
        DIGIT,
        new Bool({ num: 1n, den: 2n }),
        new Sizes(0, undefined),
      );

      check.equal(
        seat,
        drawnLiteral(generator, new Pairs([[1n, true]])),
        {
          type: "map",
          entries: [
            [
              { type: "int", value: 1 },
              { type: "bool", value: true },
            ],
          ],
        },
        "a map of entries",
      );
    });

    it("returns undefined for a map with a value that no literal states", ({
      seat,
    }) => {
      const generator = new Dict(
        DIGIT,
        DIGIT.map(() => Symbol("v")),
        new Sizes(0, undefined),
      );

      check.isNil(
        seat,
        drawnLiteral(generator, new Pairs([[1n, Symbol("v")]])),
        "a symbol has no literal",
      );
    });

    it("returns the literal of a Map of dict through the dict's inverse", ({
      seat,
    }) => {
      check.equal(
        seat,
        drawnLiteral(dict(string(), boolean()), new Map([["a", false]])),
        {
          type: "map",
          entries: [
            [
              { type: "string", value: "a" },
              { type: "bool", value: false },
            ],
          ],
        },
        "a map of entries",
      );
    });

    it("returns the literal of the value's own type for a non-dict value of a dict's generator", ({
      seat,
    }) => {
      const generator = new Dict(DIGIT, DIGIT, new Sizes(0, undefined));

      check.equal(
        seat,
        drawnLiteral(generator, 1n),
        { type: "int", value: 1 },
        "an int",
      );
    });

    it("returns the entries of a map shape through the shapes of its entries", ({
      seat,
    }) => {
      const shape = read({
        shape: "map",
        key: { shape: "string" },
        of: { shape: "bool" },
      });

      check.equal(
        seat,
        drawnLiteral(shape, new Pairs([["k", true]])),
        {
          type: "map",
          entries: [
            [
              { type: "string", value: "k" },
              { type: "bool", value: true },
            ],
          ],
        },
        "a map of entries",
      );
    });

    it("returns the record of a record shape's fields", ({ seat }) => {
      const shape = read({
        shape: "record",
        fields: [
          ["id", { shape: "int", width: 64, signed: true }],
          ["ok", { shape: "bool" }],
        ],
      });

      check.equal(
        seat,
        drawnLiteral(
          shape,
          new Fields([
            ["id", 7n],
            ["ok", false],
          ]),
        ),
        {
          type: "record",
          fields: [
            ["id", { type: "int", value: 7 }],
            ["ok", { type: "bool", value: false }],
          ],
        },
        "a record of fields",
      );
    });

    it("returns undefined for a record with a field that no literal states", ({
      seat,
    }) => {
      const shape = read({
        shape: "record",
        fields: [["id", { shape: "int", width: 64, signed: true }]],
      });

      check.isNil(
        seat,
        drawnLiteral(shape, new Fields([["id", Symbol("v")]])),
        "a symbol has no literal",
      );
    });

    it("returns the literal of the value's own type for a non-record value of a record shape", ({
      seat,
    }) => {
      const shape = read({ shape: "record", fields: [["id", { shape: "bool" }]] });

      check.equal(
        seat,
        drawnLiteral(shape, true),
        { type: "bool", value: true },
        "a bool",
      );
    });

    it("returns the variant of an enum shape with its payload", ({ seat }) => {
      const shape = read({
        shape: "enum",
        variants: [
          ["none", null],
          ["some", { shape: "int", width: 64, signed: true }],
        ],
      });

      check.equal(
        seat,
        drawnLiteral(shape, new Variant("some", 3n)),
        { type: "variant", name: "some", payload: { type: "int", value: 3 } },
        "a variant with a payload",
      );
    });

    it("returns the variant of an enum shape without a payload", ({ seat }) => {
      const shape = read({ shape: "enum", variants: [["none", null]] });

      check.equal(
        seat,
        drawnLiteral(shape, new Variant("none")),
        { type: "variant", name: "none" },
        "a variant",
      );
    });

    it("returns undefined for a variant whose payload no literal states", ({
      seat,
    }) => {
      const shape = read({ shape: "enum", variants: [["some", { shape: "bool" }]] });

      check.isNil(
        seat,
        drawnLiteral(shape, new Variant("some", Symbol("v"))),
        "a symbol has no literal",
      );
    });

    it("returns the literal of the value's own type for a non-variant value of an enum shape", ({
      seat,
    }) => {
      const shape = read({ shape: "enum", variants: [["none", null]] });

      check.equal(
        seat,
        drawnLiteral(shape, "none"),
        { type: "string", value: "none" },
        "a string",
      );
    });

    it("returns the literal of a value of a recursive shape through its definition", ({
      seat,
    }) => {
      const shape = read({
        shape: "ref",
        name: "Tree",
        definitions: { Tree: { shape: "list", of: { shape: "ref", name: "Tree" } } },
      });

      check.equal(
        seat,
        drawnLiteral(shape, [[]]),
        { type: "list", items: [{ type: "list", items: [] }] },
        "a list of lists",
      );
    });

    it("returns the int of a 128-bit integer", ({ seat }) => {
      const shape = read({ shape: "int", width: 128, signed: true });

      check.equal(
        seat,
        drawnLiteral(shape, 2n ** 100n),
        { type: "int", value: String(2n ** 100n) },
        "an int",
      );
    });

    it("returns the bytes of a byte string", ({ seat }) => {
      const generator = new Bytes(new SequenceBounds(256, 0, undefined));

      check.equal(
        seat,
        drawnLiteral(generator, Uint8Array.of(1, 255)),
        { type: "bytes", value: "01ff" },
        "bytes",
      );
    });

    it("returns the bytes of an IP address", ({ seat }) => {
      const shape = read({ shape: "ip-address" });

      check.equal(
        seat,
        drawnLiteral(shape, Uint8Array.of(127, 0, 0, 1)),
        { type: "bytes", value: "7f000001" },
        "bytes",
      );
    });

    it("returns the string of a text generator", ({ seat }) => {
      const generator = new Text(undefined, new SequenceBounds(10, 0, undefined));

      check.equal(
        seat,
        drawnLiteral(generator, "ab"),
        { type: "string", value: "ab" },
        "a string",
      );
    });

    it("returns the literal of the value's own type for a value of another type than its generator's", ({
      seat,
    }) => {
      check.equal(
        seat,
        drawnLiteral(DIGIT, "3"),
        { type: "string", value: "3" },
        "a string",
      );
    });

    it("returns undefined for a decoded record that contains a value of no literal", ({
      seat,
    }) => {
      check.isNil(
        seat,
        drawnLiteral(DIGIT, new Fields([["f", () => 1]])),
        "a function has no literal",
      );
    });

    it("returns the engine's literal of a decoded variant of another generator", ({
      seat,
    }) => {
      check.equal(
        seat,
        drawnLiteral(DIGIT, new Variant("v")),
        { type: "variant", name: "v" },
        "a variant",
      );
    });
  });
});
