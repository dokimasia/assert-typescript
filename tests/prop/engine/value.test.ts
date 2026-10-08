/** The spec of decoded values, and the equality that uniqueness is decided by. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { canonical, Fields, Pairs, Variant } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";

/** A class whose instances compare by identity. */
class Widget {}

/** A function that compares by identity. */
function named(): number {
  return 1;
}

describe("value", () => {
  describe("new Pairs", () => {
    it("keeps the entries in order", ({ seat }) => {
      check.equal(
        seat,
        new Pairs([
          [1n, "a"],
          [2n, "b"],
        ]).items,
        [
          [1n, "a"],
          [2n, "b"],
        ],
        "two entries",
      );
    });
  });

  describe("new Fields", () => {
    it("keeps the fields in order", ({ seat }) => {
      check.equal(
        seat,
        new Fields([
          ["b", 1n],
          ["a", 2n],
        ]).fields,
        [
          ["b", 1n],
          ["a", 2n],
        ],
        "two fields",
      );
    });
  });

  describe("new Variant", () => {
    it("returns a variant with a payload when one is given", ({ seat }) => {
      const variant = new Variant("note", undefined);

      check.equal(
        seat,
        [variant.name, variant.hasPayload, variant.payload],
        ["note", true, undefined],
        "an absent payload",
      );
    });

    it("returns a variant without a payload when none is given", ({ seat }) => {
      const variant = new Variant("pending");

      check.equal(
        seat,
        [variant.name, variant.hasPayload],
        ["pending", false],
        "no payload",
      );
    });
  });

  describe("canonical", () => {
    const equal = [
      { name: "every NaN", give: [Number.NaN, -Number.NaN] as const },
      { name: "undefined and null", give: [undefined, null] as const },
      {
        name: "two lists of equal elements",
        give: [
          [1n, [0]],
          [1n, [0]],
        ] as const,
      },
      {
        name: "two dicts with their entries in another order",
        give: [
          new Pairs([
            [1n, "a"],
            [2n, "b"],
          ]),
          new Pairs([
            [2n, "b"],
            [1n, "a"],
          ]),
        ] as const,
      },
      {
        name: "a Map and a dict of the same entries",
        give: [new Map([[1n, "a"]]), new Pairs([[1n, "a"]])] as const,
      },
      {
        name: "two Sets with their elements in another order",
        give: [new Set([1n, 2n]), new Set([2n, 1n])] as const,
      },
      {
        name: "two records of the same fields",
        give: [
          new Fields([
            ["a", 1n],
            ["b", 0],
          ]),
          new Fields([
            ["a", 1n],
            ["b", 0],
          ]),
        ] as const,
      },
      {
        name: "two plain objects of the same fields",
        give: [{ a: 1n }, { a: 1n }] as const,
      },
      {
        name: "an object without a prototype and a plain object",
        give: [
          Object.assign(Object.create(null) as object, { a: 1n }),
          { a: 1n },
        ] as const,
      },
      {
        name: "two variants of one name and payload",
        give: [new Variant("x", [1n]), new Variant("x", [1n])] as const,
      },
      {
        name: "two equal byte strings",
        give: [Uint8Array.of(1, 2), Uint8Array.of(1, 2)] as const,
      },
      { name: "two dates of one instant", give: [new Date(0), new Date(0)] as const },
      {
        name: "two plain dates of one day",
        give: [
          Temporal.PlainDate.from("2026-10-08"),
          Temporal.PlainDate.from("2026-10-08"),
        ] as const,
      },
      {
        name: "two symbols of one registered key",
        give: [Symbol.for("dokimi"), Symbol.for("dokimi")] as const,
      },
      { name: "a function and itself", give: [named, named] as const },
    ];
    for (const tt of equal) {
      it(`returns one text for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          canonical(tt.give[0]),
          canonical(tt.give[1]),
          "the same text",
        );
      });
    }

    const different = [
      { name: "the two zeros", give: [0, -0] as const },
      { name: "a boolean and an integer", give: [true, 1n] as const },
      { name: "an integer and a float", give: [1n, 1] as const },
      { name: "undefined and zero", give: [undefined, 0n] as const },
      {
        name: "lists that differ in the sign of a nested zero",
        give: [
          [1n, [0]],
          [1n, [-0]],
        ] as const,
      },
      {
        name: "dicts whose keys are a boolean and an integer",
        give: [new Pairs([[true, "a"]]), new Pairs([[1n, "a"]])] as const,
      },
      {
        name: "dicts with another value",
        give: [new Pairs([[1n, "a"]]), new Pairs([[1n, "c"]])] as const,
      },
      {
        name: "a string and the bytes of its characters",
        give: ["a", Uint8Array.of(97)] as const,
      },
      {
        name: "records with their fields in another order",
        give: [
          new Fields([
            ["a", 1n],
            ["b", 2n],
          ]),
          new Fields([
            ["b", 2n],
            ["a", 1n],
          ]),
        ] as const,
      },
      {
        name: "a record and a plain object of the same fields",
        give: [new Fields([["a", 1n]]), { a: 1n }] as const,
      },
      {
        name: "a variant without a payload and one with an absent payload",
        give: [new Variant("x"), new Variant("x", undefined)] as const,
      },
      {
        name: "variants of two names",
        give: [new Variant("x"), new Variant("y")] as const,
      },
      {
        name: "variants of two payloads",
        give: [new Variant("x", 1n), new Variant("x", 2n)] as const,
      },
      {
        name: "a set and a list of the same elements",
        give: [new Set([1n]), [1n]] as const,
      },
      {
        name: "a plain date and a plain date and time",
        give: [
          Temporal.PlainDate.from("2026-10-08"),
          Temporal.PlainDateTime.from("2026-10-08T00:00"),
        ] as const,
      },
      {
        name: "two symbols without a registered key",
        give: [Symbol("dokimi"), Symbol("dokimi")] as const,
      },
      { name: "two functions", give: [() => 1, () => 1] as const },
      { name: "two instances of a class", give: [new Widget(), new Widget()] as const },
    ];
    for (const tt of different) {
      it(`returns two texts for ${tt.name}`, ({ seat }) => {
        check.notEqual(seat, canonical(tt.give[0]), canonical(tt.give[1]), "two texts");
      });
    }

    it("returns one text for an instance of a class and itself", ({ seat }) => {
      const widget = new Widget();

      check.equal(seat, canonical(widget), canonical(widget), "the identity");
    });

    it("returns one text for a symbol without a registered key and itself", ({
      seat,
    }) => {
      const symbol = Symbol("dokimi");

      check.equal(seat, canonical(symbol), canonical(symbol), "the identity");
    });
  });
});
