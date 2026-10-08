/**
 * The spec of running generators backwards: the choices of a generated
 * value replay to that value, and the first sequence of choices where more
 * than one decodes to a value.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  Case,
  DECODE,
  Generating,
  Rejected,
  Replaying,
} from "../../../src/prop/engine/case.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import {
  Bool,
  Bytes,
  Composite,
  Dict,
  Filter,
  Float,
  type Generator,
  Integer,
  Just,
  List,
  Mapped,
  Matching,
  OneOf,
  Optional,
  Permutation,
  Recursive,
  SampledFrom,
  Text,
} from "../../../src/prop/engine/generator.js";
import {
  CannotInvert,
  emit,
  inverseOf,
  invert,
  NoInverse,
} from "../../../src/prop/engine/inverse.js";
import { piece } from "../../../src/prop/engine/pattern.js";
import { read } from "../../../src/prop/engine/shape.js";
import { caseSource } from "../../../src/prop/engine/source.js";
import { canonical, Fields, Pairs, Variant } from "../../../src/prop/engine/value.js";
import { ZONES } from "../../../src/prop/engine/zone.js";
import { test as it } from "../../../src/vitest.js";

/** Cases per generator of the round trip. */
const CASES = 60;

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const TEEN = new Integer(new IntegerBounds(10n, 20n));
const DIGITS = new List(DIGIT, new Sizes(0, 3));
const EVEN = new Filter(DIGIT, (value) => value % 2n === 0n);
const UINT8 = { shape: "int", width: 8, signed: false };

/** A map of a digit without an inverse. */
const IDENTITY = new Mapped(DIGIT, (value: bigint) => value);

/** Returns a tree of digits: a digit, or a list of at most three trees. */
function tree(base: Generator<unknown> = DIGIT): Recursive<unknown> {
  return new Recursive<unknown>(base, 100, (self) => new List(self, new Sizes(0, 3)));
}

/** A tree of shapes: a value and a list of children, each a tree. */
const TREE_SHAPE = {
  shape: "ref",
  name: "tree",
  definitions: {
    tree: {
      shape: "record",
      fields: [
        ["value", UINT8],
        ["children", { shape: "list", of: { shape: "ref", name: "tree" } }],
      ],
    },
  },
};

/** Returns the values of choices. */
function valuesOf(choices: readonly Choice[]): unknown[] {
  return choices.map((choice) => choice.value);
}

/** Returns the value that choices decode to. */
function replayed(generator: Generator<unknown>, choices: readonly Choice[]): unknown {
  return generator[DECODE](new Case(new Replaying(choices)));
}

/** Returns the canonical text of a value, a set's elements in no order. */
function textOf(value: unknown, unordered: boolean): string {
  return unordered
    ? [...(value as unknown[]).map(canonical)].sort().join(";")
    : canonical(value);
}

/**
 * Returns the cases out of CASES whose generated value runs backwards to
 * choices that replay to it, and those that do not.
 */
function roundTrip(
  generator: Generator<unknown>,
  unordered = false,
): [number, number[]] {
  let inverted = 0;
  const failed: number[] = [];
  for (let index = 0; index < CASES; index += 1) {
    let value: unknown;
    try {
      value = generator[DECODE](
        new Case(new Generating(caseSource(17n, BigInt(index)))),
      );
    } catch (error) {
      if (error instanceof Rejected) continue;
      throw error;
    }
    if (
      textOf(replayed(generator, invert(generator, value)), unordered) !==
      textOf(value, unordered)
    )
      failed.push(index);
    inverted += 1;
  }
  return [inverted, failed];
}

/** Returns the message of the CannotInvert that invert throws, and whether it is a NoInverse. */
function refusal(generator: Generator<unknown>, value: unknown): [string, boolean] {
  try {
    invert(generator, value);
  } catch (error) {
    if (error instanceof CannotInvert)
      return [error.message, error instanceof NoInverse];
    throw error;
  }
  return ["", false];
}

describe("inverse", () => {
  describe("new CannotInvert", () => {
    it("returns the refusal of a value", ({ seat }) => {
      const err = new CannotInvert("prop: int:10 is outside integer 0 9");

      check.equal(
        seat,
        [err.name, err.message],
        ["CannotInvert", "prop: int:10 is outside integer 0 9"],
        "the name and the message",
      );
    });
  });

  describe("new NoInverse", () => {
    it("returns a refusal of a value", ({ seat }) => {
      check.errorIs(
        seat,
        new NoInverse("prop: a map does not run backwards"),
        CannotInvert,
        "a NoInverse is a CannotInvert",
      );
    });
  });

  describe("invert", () => {
    const generators: [string, Generator<unknown>][] = [
      ["integer", DIGIT],
      [
        "float",
        new Float(
          new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true),
        ),
      ],
      ["boolean", new Bool({ num: 1n, den: 3n })],
      ["just", new Just(4n)],
      ["sampled-from", new SampledFrom(["a", "b", "c"])],
      ["one-of", new OneOf([DIGIT, TEEN])],
      ["optional", new Optional(DIGIT)],
      ["list", DIGITS],
      ["unique list", new List(DIGIT, new Sizes(), true)],
      ["dict", new Dict(DIGIT, new Bool({ num: 1n, den: 2n }), new Sizes(0, 3))],
      ["string", new Text(undefined, new SequenceBounds(0x10f800, 0, 4))],
      ["alphabet", new Text(["x", "y", "z"], new SequenceBounds(3))],
      ["string-matching", new Matching(piece("(a|[0-9]+)\\.?x{2}"))],
      ["bytes", new Bytes(new SequenceBounds(256))],
      [
        "duration",
        new Integer(new IntegerBounds(-1_000_000_000n, 1_000_000_000n), "duration"),
      ],
      ["permutation", new Permutation(["a", "b", "c"])],
      ["recursive", tree()],
      ["filter", EVEN],
      [
        "map with an inverse",
        new Mapped(
          DIGIT,
          (value: bigint) => String(value),
          (text: string) => BigInt(text),
        ),
      ],
    ];
    for (const [name, generator] of generators) {
      it(`runs a generated ${name} backwards to choices that replay to it`, ({
        seat,
      }) => {
        const [inverted, failed] = roundTrip(generator);

        check.equal(
          seat,
          [inverted > CASES / 2, failed],
          [true, []],
          "more than half of the cases, each replayed",
        );
      });
    }

    const shapes: [string, unknown][] = [
      ["bool", { shape: "bool" }],
      ["int", { shape: "int", width: 16, signed: true }],
      ["int-128", { shape: "int", width: 128, signed: true }],
      ["float", { shape: "float", width: 32, allow_nan: true }],
      ["char", { shape: "char" }],
      ["string", { shape: "string", max_size: 6 }],
      ["pattern", { shape: "string", pattern: "[a-c]{2,4}(x|yz)?" }],
      ["bytes", { shape: "bytes", max_size: 4 }],
      ["list", { shape: "list", of: UINT8, max_size: 4 }],
      ["fixed-list", { shape: "fixed-list", of: UINT8, size: 3 }],
      ["set", { shape: "set", of: { shape: "int", width: 8, signed: true } }],
      ["map", { shape: "map", key: UINT8, of: { shape: "bool" } }],
      ["optional", { shape: "optional", of: UINT8 }],
      [
        "record",
        {
          shape: "record",
          fields: [
            ["id", UINT8],
            ["ok", { shape: "bool" }],
          ],
        },
      ],
      [
        "enum",
        {
          shape: "enum",
          variants: [
            ["none", null],
            ["some", UINT8],
          ],
        },
      ],
      [
        "literal",
        {
          shape: "literal",
          values: ["a", "b", "a"].map((value) => ({ type: "string", value })),
        },
      ],
      ["ref", TREE_SHAPE],
      ["uuid", { shape: "uuid" }],
      ["ip-address", { shape: "ip-address" }],
      ["decimal", { shape: "decimal", scale: 2, min: "-5.00", max: "5.00" }],
      ["instant", { shape: "instant", unit: "ms", min: "2020-01-01T00:00:00.5Z" }],
      ["instant in seconds", { shape: "instant", unit: "s" }],
      ["date", { shape: "date" }],
      ["time-of-day", { shape: "time-of-day", unit: "us" }],
      ["local-date-time", { shape: "local-date-time", unit: "s" }],
      ["duration", { shape: "duration", unit: "ns" }],
      ["offset", { shape: "offset" }],
      ["zone", { shape: "zone" }],
      ["zoned-date-time", { shape: "zoned-date-time", unit: "ns" }],
      ["wall-time", { shape: "wall-time", unit: "ms" }],
    ];
    for (const [name, shape] of shapes) {
      it(`runs a generated ${name} shape backwards to choices that replay to it`, ({
        seat,
      }) => {
        const [inverted, failed] = roundTrip(read(shape), name === "set");

        check.equal(
          seat,
          [inverted > CASES / 2, failed],
          [true, []],
          "more than half of the cases, each replayed",
        );
      });
    }

    it("takes the first alternative of a one-of that produces the value", ({
      seat,
    }) => {
      const either = new OneOf([DIGIT, new Integer(new IntegerBounds(5n, 15n))]);

      check.equal(
        seat,
        [valuesOf(invert(either, 7n)), valuesOf(invert(either, 12n))],
        [
          [0n, 7n],
          [1n, 12n],
        ],
        "7 from the first, 12 from the second",
      );
    });

    it("takes the first index of an equal value of a sampled-from", ({ seat }) => {
      check.equal(
        seat,
        valuesOf(invert(new SampledFrom(["a", "b", "a"]), "a")),
        [0n],
        "index 0",
      );
    });

    it("takes the smallest index at each swap of a permutation", ({ seat }) => {
      check.equal(
        seat,
        valuesOf(invert(new Permutation([1n, 1n, 2n]), [1n, 2n, 1n])),
        [0n, 2n],
        "the first 1 remains",
      );
    });

    const patterns = [
      {
        name: "the greedy match of a repetition",
        give: ["a*a*", "aa"] as const,
        want: [1n, 1n, 0n, 0n],
      },
      {
        name: "the first alternative that matches",
        give: ["x|x", "x"] as const,
        want: [0n],
      },
      {
        name: "a repetition that gives back a character to the rest",
        give: ["a*ab", "aab"] as const,
        want: [1n, 0n],
      },
      {
        name: "the next alternative after a short match",
        give: ["a|ab", "ab"] as const,
        want: [1n],
      },
      {
        name: "a sequence that resumes its search after a short match",
        give: ["(a|ab)c*", "ab"] as const,
        want: [1n, 0n],
      },
      {
        name: "a repetition that does not repeat an empty match",
        give: ["(a?)*", "a"] as const,
        want: [1n, 1n, 0n, 0n],
      },
      {
        name: "a class index of each character",
        give: ["[a-c]x", "cx"] as const,
        want: [2n],
      },
    ];
    for (const tt of patterns) {
      it(`takes ${tt.name}`, ({ seat }) => {
        const [text, value] = tt.give;

        check.equal(
          seat,
          valuesOf(invert(new Matching(piece(text)), value)),
          tt.want,
          "the choices",
        );
      });
    }

    it("takes absent for the absent value of an optional of an optional", ({
      seat,
    }) => {
      check.equal(
        seat,
        valuesOf(invert(new Optional(new Optional(DIGIT)), undefined)),
        [0n],
        "absent outside",
      );
    });

    it("takes the elements of a set in shortlex order", ({ seat }) => {
      check.equal(
        seat,
        valuesOf(invert(read({ shape: "set", of: UINT8 }), [5n, 2n])),
        [1n, 2n, 1n, 5n, 0n],
        "2 before 5",
      );
    });

    it("takes the entries of a map in shortlex order", ({ seat }) => {
      const choices = invert(
        read({ shape: "map", key: UINT8, of: UINT8 }),
        new Pairs([
          [4n, 0n],
          [1n, 9n],
        ]),
      );

      check.equal(
        seat,
        valuesOf(choices),
        [1n, 1n, 9n, 1n, 4n, 0n, 0n],
        "the entry of key 1 first",
      );
    });

    it("takes the whole range for an instant at a change of its zone", ({ seat }) => {
      const change = ZONES[1]?.changes[0];
      const value = new Fields([
        [
          "instant",
          new Fields([
            ["seconds", change?.at],
            ["units", 0n],
          ]),
        ],
        ["zone", "Europe/Amsterdam"],
      ]);

      check.equal(
        seat,
        valuesOf(invert(read({ shape: "zoned-date-time", unit: "s" }), value)),
        [1n, 0n, change?.at],
        "the zone, 0, then the instant",
      );
    });

    it("takes the zone without a whole-range choice for a zone without a change", ({
      seat,
    }) => {
      const value = new Fields([
        [
          "local-date-time",
          new Fields([
            ["date", 1n],
            ["time-of-day", 2n],
          ]),
        ],
        ["zone", "UTC"],
      ]);

      check.equal(
        seat,
        valuesOf(invert(read({ shape: "wall-time", unit: "s" }), value)),
        [0n, 1n, 2n],
        "UTC, then the date and the time",
      );
    });

    it("takes the base before the extension of a recursive value", ({ seat }) => {
      check.equal(
        seat,
        valuesOf(invert(tree(new List(DIGIT, new Sizes())), [])),
        [0n, 0n],
        "an empty list is a base",
      );
    });

    it("runs a nested recursive value back through its positions", ({ seat }) => {
      check.equal(
        seat,
        valuesOf(invert(tree(), [[3n]])),
        [1n, 1n, 1n, 1n, 0n, 3n, 0n, 0n],
        "a list in a list",
      );
    });

    it("runs a one-of back through an alternative with an inverse", ({ seat }) => {
      check.equal(
        seat,
        valuesOf(invert(new OneOf([IDENTITY, DIGIT]), 3n)),
        [1n, 3n],
        "the digit after the map",
      );
    });

    it("runs a filter back through the generator that it filters", ({ seat }) => {
      check.equal(seat, valuesOf(invert(EVEN, 4n)), [4n], "4 is even");
    });

    it("passes over an alternative of a one-of that cannot produce the value", ({
      seat,
    }) => {
      const cases: [Generator<unknown>[], unknown][] = [
        [
          [new List(DIGIT, new Sizes(0, 1)), new List(DIGIT, new Sizes(0, 3))],
          [1n, 2n],
        ],
        [
          [new List(DIGIT, new Sizes(), true), new List(DIGIT, new Sizes())],
          [1n, 1n],
        ],
        [[EVEN, DIGIT], 3n],
      ];

      check.equal(
        seat,
        cases.map(
          ([alternatives, value]) => invert(new OneOf(alternatives), value)[0]?.value,
        ),
        [1n, 1n, 1n],
        "the second alternative each time",
      );
    });

    const refusals: [string, Generator<unknown>, unknown, string][] = [
      [
        "an integer outside its bounds",
        DIGIT,
        10n,
        "prop: int:10 is outside integer 0 9",
      ],
      [
        "a boolean for an integer",
        DIGIT,
        true,
        "prop: bool:true is outside integer 0 9",
      ],
      [
        "an integer for a boolean",
        new Bool({ num: 1n, den: 2n }),
        1n,
        "prop: int:1 is no boolean",
      ],
      ["another value than a just", new Just(4n), 5n, "prop: int:5 is not int:4"],
      [
        "a list longer than its maximum",
        new List(DIGIT, new Sizes(0, 1)),
        [1n, 2n],
        "prop: 2 items are outside the collection's sizes",
      ],
      [
        "a repeat in a unique list",
        new List(DIGIT, new Sizes(), true),
        [1n, 1n],
        "prop: list:[int:1,int:1] repeats a value",
      ],
      ["a set for a list", DIGITS, new Set([1n]), "prop: set:{int:1} is no list"],
      [
        "a Map for a dict",
        new Dict(DIGIT, DIGIT, new Sizes()),
        new Map([[1n, 2n]]),
        "prop: map:{int:1=int:2} is no map",
      ],
      [
        "a repeated key of a dict",
        new Dict(DIGIT, DIGIT, new Sizes()),
        new Pairs([
          [1n, 2n],
          [1n, 3n],
        ]),
        "prop: list:[int:1,int:1] repeats a value",
      ],
      [
        "a character outside a stated alphabet",
        new Text(["a", "b"], new SequenceBounds(2)),
        "c",
        'prop: string:"c" has a character outside the alphabet',
      ],
      [
        "a lone surrogate for the default alphabet",
        new Text(undefined, new SequenceBounds(0x10f800)),
        "\ud800",
        'prop: string:"\\ud800" has a character outside the alphabet',
      ],
      [
        "bytes for a string",
        new Text(undefined, new SequenceBounds(0x10f800)),
        Uint8Array.of(120),
        "prop: bytes:78 is no string",
      ],
      [
        "bytes longer than their maximum",
        new Bytes(new SequenceBounds(256, 0, 1)),
        Uint8Array.of(1, 2),
        "prop: list:[float:4607182418800017408,float:4611686018427387904] is outside sequence 256 0 1",
      ],
      [
        "a string for bytes",
        new Bytes(new SequenceBounds(256)),
        "x",
        'prop: string:"x" is no bytes',
      ],
      [
        "a string that the pattern does not match",
        new Matching(piece("a+")),
        "b",
        'prop: the pattern does not match string:"b" in full',
      ],
      [
        "an integer for a pattern",
        new Matching(piece("a+")),
        1n,
        "prop: int:1 is no string",
      ],
      [
        "a value of no alternative",
        new OneOf([DIGIT]),
        11n,
        "prop: no alternative produces int:11",
      ],
      ["a value that the filter rejects", EVEN, 3n, "prop: the filter rejects int:3"],
      [
        "another value than a permutation's",
        new Permutation([1n]),
        [2n],
        "prop: list:[int:2] is no permutation of the values",
      ],
      [
        "more values than a permutation's",
        new Permutation([1n]),
        [1n, 1n],
        "prop: list:[int:1,int:1] is no permutation of the values",
      ],
      [
        "a value that is no permutation's",
        new Permutation([1n, 2n]),
        [3n, 1n],
        "prop: int:3 is none of the values",
      ],
      [
        "a value that is none of a sampled-from's",
        new SampledFrom([1n]),
        2n,
        "prop: int:2 is none of the values",
      ],
      [
        "a string that neither the base nor the extension produces",
        tree(),
        "x",
        'prop: neither the base nor the extension produces string:"x"',
      ],
    ];
    for (const [name, generator, value, want] of refusals) {
      it(`throws a CannotInvert for ${name}`, ({ seat }) => {
        const [message, none] = refusal(generator, value);

        check.equal(
          seat,
          [message.startsWith(want), none],
          [true, false],
          `the refusal starts with ${want}`,
        );
      });
    }

    const shapeRefusals: [string, unknown, unknown, string][] = [
      [
        "a record of other fields",
        { shape: "record", fields: [["id", UINT8]] },
        new Fields([["x", 1n]]),
        'prop: record:["x"=int:1] is no record of id',
      ],
      [
        "an integer for a record",
        { shape: "record", fields: [["id", UINT8]] },
        5n,
        "prop: int:5 is no record of id",
      ],
      [
        "a variant of no name of the enum",
        { shape: "enum", variants: [["a", null]] },
        new Variant("b"),
        'prop: variant:"b" is no variant of a',
      ],
      [
        "a payload of a variant without one",
        { shape: "enum", variants: [["a", null]] },
        new Variant("a", 1n),
        "prop: the variant a has no payload",
      ],
      [
        "a string for an enum",
        { shape: "enum", variants: [["a", null]] },
        "a",
        'prop: string:"a" is no variant of a',
      ],
      [
        "units of an instant at seconds",
        { shape: "instant", unit: "s" },
        new Fields([
          ["seconds", 0n],
          ["units", 1n],
        ]),
        "prop: an instant at seconds has no units, not int:1",
      ],
      [
        "an integer for an instant",
        { shape: "instant", unit: "s" },
        0n,
        "prop: int:0 is no record of seconds and units",
      ],
      [
        "an address of five bytes",
        { shape: "ip-address" },
        new Uint8Array(5),
        "prop: bytes:0000000000 is neither 4 nor 16 bytes",
      ],
      [
        "a string for an address",
        { shape: "ip-address" },
        "127.0.0.1",
        'prop: string:"127.0.0.1" is no address',
      ],
      [
        "a zone outside the list",
        { shape: "zone" },
        "Mars/Olympus",
        'prop: string:"Mars/Olympus" is none of the values',
      ],
      [
        "a zoned value of a zone outside the list",
        { shape: "zoned-date-time", unit: "s" },
        new Fields([
          ["instant", 0n],
          ["zone", "Mars/Olympus"],
        ]),
        'prop: string:"Mars/Olympus" is none of the values',
      ],
      [
        "a negative integer for an unsigned 128-bit int",
        { shape: "int", width: 128, signed: false },
        -1n,
        "prop: int:-1 is outside integer 0 18446744073709551615",
      ],
      [
        "a float for a 128-bit int",
        { shape: "int", width: 128, signed: false },
        1.5,
        "prop: float:4609434218613702656 is no integer",
      ],
    ];
    for (const [name, shape, value, want] of shapeRefusals) {
      it(`throws a CannotInvert for ${name}`, ({ seat }) => {
        const [message, none] = refusal(read(shape), value);

        check.equal(seat, [message, none], [want, false], "the refusal");
      });
    }

    it("throws a CannotInvert for a value of more choices than a case may make", ({
      seat,
    }) => {
      const [message, none] = refusal(
        new List(DIGIT, new Sizes()),
        new Array<bigint>(9000).fill(0n),
      );

      check.equal(
        seat,
        [message.endsWith("decodes to no value"), none],
        [true, false],
        "9,000 digits take more than 8,192 choices",
      );
    });

    it("throws a CannotInvert for a tree past its budget", ({ seat }) => {
      let value: unknown = new Fields([
        ["value", 0n],
        ["children", []],
      ]);
      for (let level = 0; level < 100; level += 1) {
        value = new Fields([
          ["value", 0n],
          ["children", [value]],
        ]);
      }

      check.equal(
        seat,
        refusal(read(TREE_SHAPE), value)[0].endsWith(
          "is no value that the generator produces",
        ),
        true,
        "the replay stops at the budget",
      );
    });

    it("throws a CannotInvert for a value that the inverse of a map refuses", ({
      seat,
    }) => {
      const parsed = new Mapped(DIGIT, String, (text: string) => {
        if (!/^[0-9]$/.test(text)) throw new SyntaxError(`${text} is no digit`);
        return BigInt(text);
      });

      check.equal(
        seat,
        refusal(parsed, "x"),
        ['prop: string:"x" is no value of the map: x is no digit', false],
        "the inverse's error",
      );
    });

    it("passes on a CannotInvert of the inverse of a map", ({ seat }) => {
      const strict = new Mapped(DIGIT, String, () => {
        throw new CannotInvert("prop: the map refuses it");
      });

      check.equal(
        seat,
        refusal(strict, "1"),
        ["prop: the map refuses it", false],
        "the inverse's refusal",
      );
    });

    it("throws a NoInverse for a map without an inverse", ({ seat }) => {
      check.equal(
        seat,
        refusal(IDENTITY, 1n),
        ["prop: a map does not run backwards", true],
        "no inverse",
      );
    });

    it("throws a NoInverse for a generator without an emitter", ({ seat }) => {
      check.equal(
        seat,
        refusal(new Composite(() => 1n), 1n),
        ["prop: a Composite does not run backwards", true],
        "no emitter",
      );
    });

    const around: [string, Generator<unknown>, unknown][] = [
      ["a list", new List(IDENTITY, new Sizes()), [1n]],
      ["an optional", new Optional(IDENTITY), 1n],
      ["a filter", new Filter(IDENTITY, () => true), 1n],
    ];
    for (const [name, generator, value] of around) {
      it(`throws a NoInverse for ${name} around a map without an inverse`, ({
        seat,
      }) => {
        check.isTrue(
          seat,
          refusal(generator, value)[1],
          "the refusal inside passes on",
        );
      });
    }

    it("throws a NoInverse for a one-of whose branch without an inverse might produce the value", ({
      seat,
    }) => {
      check.equal(
        seat,
        refusal(new OneOf([DIGIT, IDENTITY]), 11n),
        ["prop: no alternative produces int:11, and one of them has no inverse", true],
        "no inverse",
      );
    });

    it("throws a NoInverse for a recursive value whose base has no inverse", ({
      seat,
    }) => {
      check.equal(
        seat,
        refusal(tree(IDENTITY), "x"),
        [
          'prop: neither the base nor the extension produces string:"x", and one of them has no inverse',
          true,
        ],
        "no inverse",
      );
    });

    it("throws a CannotInvert that is no NoInverse for a value outside every branch with an inverse", ({
      seat,
    }) => {
      check.equal(
        seat,
        refusal(new OneOf([DIGIT]), 11n)[1],
        false,
        "the value is outside the domain",
      );
    });

    it("throws an error of the generator that is no refusal", ({ seat }) => {
      const broken = new Mapped(
        DIGIT,
        (): bigint => {
          throw new TypeError("the map broke");
        },
        (value: bigint) => value,
      );

      check.errorIs(
        seat,
        check.throws(seat, () => invert(broken, 1n), "the map throws"),
        TypeError,
        "the map's error",
      );
    });

    it("throws an error of a branch that is no refusal", ({ seat }) => {
      const broken = new Mapped(
        DIGIT,
        (): bigint => {
          throw new TypeError("the map broke");
        },
        (value: bigint) => value,
      );

      check.errorIs(
        seat,
        check.throws(seat, () => invert(new OneOf([broken]), 1n), "the branch throws"),
        TypeError,
        "the branch's error",
      );
    });

    it("throws an error of a replay that is no rejection", ({ seat }) => {
      let calls = 0;
      const flaky = new Mapped(
        DIGIT,
        (value: bigint) => {
          calls += 1;
          if (calls > 1) throw new RangeError("the second call broke");
          return value;
        },
        (value: bigint) => value,
      );

      check.errorIs(
        seat,
        check.throws(seat, () => invert(flaky, 1n), "the replay throws"),
        RangeError,
        "the replay's error",
      );
    });
  });

  describe("inverseOf", () => {
    it("returns the choices that decode to a value", ({ seat }) => {
      check.equal(
        seat,
        inverseOf(DIGIT, 7n),
        [{ kind: "integer", value: 7n }],
        "one choice",
      );
    });

    it("returns undefined for a value that the generator cannot produce", ({
      seat,
    }) => {
      check.isNil(seat, inverseOf(DIGIT, 10n), "10 is no digit");
    });

    it("returns undefined for a generator without an inverse", ({ seat }) => {
      check.isNil(seat, inverseOf(IDENTITY, 1n), "a map without an inverse");
    });

    it("throws an error of the generator that is no refusal", ({ seat }) => {
      const broken = new Mapped(
        DIGIT,
        (): bigint => {
          throw new TypeError("the map broke");
        },
        (value: bigint) => value,
      );

      check.errorIs(
        seat,
        check.throws(seat, () => inverseOf(broken, 1n), "the map throws"),
        TypeError,
        "the map's error",
      );
    });
  });

  describe("emit", () => {
    it("returns the steps of a value with the value that they decode to", ({
      seat,
    }) => {
      const [steps, normal] = emit(read({ shape: "set", of: UINT8 }), [5n, 2n]);

      check.equal(
        seat,
        [steps.map((step) => step.value), normal],
        [
          [1n, 2n, 1n, 5n, 0n],
          [2n, 5n],
        ],
        "the elements in shortlex order",
      );
    });
  });
});
