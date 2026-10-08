/**
 * The spec of shapes: what each decodes from recorded choices, its
 * defaults, and how a read fails. The decoded values are those of the
 * definition's reference implementation.
 */

import { describe } from "vitest";
import { check, prop } from "../../../src/index.js";
import { Case, DECODE, Generating, Replaying } from "../../../src/prop/engine/case.js";
import {
  type Choice,
  INT64_MAX,
  UINT64_MAX,
  type Value,
} from "../../../src/prop/engine/choice.js";
import { Integer, Just } from "../../../src/prop/engine/generator.js";
import {
  halves,
  Root,
  read,
  ShapeError,
  secondPart,
} from "../../../src/prop/engine/shape.js";
import { caseSource } from "../../../src/prop/engine/source.js";
import { canonical, Fields, Pairs, Variant } from "../../../src/prop/engine/value.js";
import { ZONES } from "../../../src/prop/engine/zone.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** The nodes that one value of a recursive shape may use. */
const BUDGET = 100;

const INT8 = { shape: "int", width: 8, signed: true };
const UINT8 = { shape: "int", width: 8, signed: false };

/** A tree: a value and a list of children, each a tree. */
const TREE = {
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

/** The first offset change of Europe/Amsterdam. */
const CHANGE = ZONES[1]?.changes[0] as (typeof ZONES)[number]["changes"][number];

/** Returns a recorded choice of the kind that the type of value implies. */
function choiceOf(value: Value): Choice {
  if (Array.isArray(value)) return { kind: "sequence", value };
  if (typeof value === "number") return { kind: "float", value };
  return { kind: "integer", value: value as bigint };
}

/** Returns the value that a shape decodes from recorded values, and the case. */
function decode(shape: unknown, ...values: Value[]): [unknown, Case] {
  const c = new Case(new Replaying(values.map(choiceOf)));
  return [read(shape)[DECODE](c), c];
}

/** Returns the canonical value that a shape decodes from recorded values. */
function decoded(shape: unknown, ...values: Value[]): string {
  return canonical(decode(shape, ...values)[0]);
}

/** Returns the seconds since 1970-01-01T00:00:00Z of a UTC midnight. */
function seconds(year: number, month: number, day: number): bigint {
  return BigInt(Date.UTC(year, month - 1, day) / 1000);
}

/** Returns an instant's record. */
function instant(at: bigint, units: bigint): Fields {
  return new Fields([
    ["seconds", at],
    ["units", units],
  ]);
}

/** Returns the floor of a / b and its remainder. */
function divmod(a: bigint, b: bigint): [bigint, bigint] {
  const quotient = a / b - (a % b < 0n ? 1n : 0n);
  return [quotient, a - quotient * b];
}

/** Returns the nodes of a tree value. */
function nodes(value: unknown): number {
  const children = (value as Fields).fields[1]?.[1] as unknown[];
  return 1 + children.reduce<number>((sum, child) => sum + nodes(child), 0);
}

describe("shape", () => {
  describe("new ShapeError", () => {
    it("returns the error of a shape that does not read", ({ seat }) => {
      const err = new ShapeError("prop: [] is not a shape");

      check.equal(
        seat,
        [err.name, err.message],
        ["ShapeError", "prop: [] is not a shape"],
        "the name and the message",
      );
    });
  });

  describe("halves", () => {
    it("returns the high and the low 64 bits of a 128-bit integer", ({ seat }) => {
      check.equal(
        seat,
        [halves(2n ** 64n + 3n), halves(-1n)],
        [
          [1n, 3n],
          [-1n, UINT64_MAX],
        ],
        "two splits",
      );
    });
  });

  describe("secondPart", () => {
    const tests = [
      {
        name: "the whole range between the bounds",
        give: 5n,
        want: `integer 0 ${UINT64_MAX}`,
      },
      {
        name: "the lower bound's second part at its first part",
        give: 1n,
        want: `integer 10 ${UINT64_MAX}`,
      },
      {
        name: "the upper bound's second part at its first part",
        give: 9n,
        want: "integer 0 20",
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          secondPart(tt.give, [1n, 10n], [9n, 20n], UINT64_MAX).id,
          tt.want,
          "the bounds",
        );
      });
    }
  });

  describe("read", () => {
    it("reads a shape without recursion as the generator that it maps to", ({
      seat,
    }) => {
      check.equal(
        seat,
        [read(INT8) instanceof Integer, read(TREE) instanceof Root],
        [true, true],
        "an integer and a root",
      );
    });

    it("reads a bool as a boolean", ({ seat }) => {
      check.equal(
        seat,
        [decode({ shape: "bool" }, 1n)[0], decode({ shape: "bool" })[0]],
        [true, false],
        "true and the target",
      );
    });

    it("reads an int over its width", ({ seat }) => {
      check.equal(
        seat,
        [
          decode(INT8, -128n)[0],
          decode(INT8, 128n)[0],
          decode(UINT8, 255n)[0],
          decode(UINT8, -1n)[0],
        ],
        [-128n, 0n, 255n, 0n],
        "both ends of a signed and an unsigned byte",
      );
    });

    it("reads the bounds of an int from its min and max", ({ seat }) => {
      const bounded = { ...INT8, min: 1, max: 99 };

      check.equal(
        seat,
        [decode(bounded, 99n)[0], decode(bounded, 100n)[0]],
        [99n, 1n],
        "100 replays as the target",
      );
    });

    it("reads a float without the infinities unless they are allowed", ({ seat }) => {
      const finite = { shape: "float", width: 64 };

      check.equal(
        seat,
        [
          decode(finite, Number.POSITIVE_INFINITY)[0],
          decode({ ...finite, allow_infinity: true }, Number.POSITIVE_INFINITY)[0],
        ],
        [0, Number.POSITIVE_INFINITY],
        "the target, then infinity",
      );
    });

    it("reads a float of width 32 as a binary32 value", ({ seat }) => {
      const narrow = { shape: "float", width: 32 };

      check.equal(
        seat,
        [decode(narrow, 0.1)[0], decode(narrow, 0.5)[0]],
        [0, 0.5],
        "0.1 is no binary32 value",
      );
    });

    it("reads a float between its stated bounds", ({ seat }) => {
      const bounded = {
        shape: "float",
        width: 64,
        min: -2,
        max: "Inf",
        allow_infinity: true,
        allow_nan: true,
      };

      check.isTrue(
        seat,
        Number.isNaN(decode(bounded, Number.NaN)[0]),
        "NaN is allowed",
      );
    });

    it("reads a char as one character of its alphabet", ({ seat }) => {
      check.equal(
        seat,
        [
          decode({ shape: "char" }, [10])[0],
          decode({ shape: "char", alphabet: "xyz" }, [2])[0],
        ],
        ["a", "z"],
        "two characters",
      );
    });

    it("reads a string as a sequence of indices", ({ seat }) => {
      check.equal(
        seat,
        [
          decode({ shape: "string", min_size: 2, max_size: 3 }, [1])[0],
          decode({ shape: "string", pattern: "a|b" }, 1n)[0],
        ],
        ["10", "b"],
        "a sized string and a pattern",
      );
    });

    it("reads bytes as a sequence of byte values", ({ seat }) => {
      check.equal(
        seat,
        decode({ shape: "bytes" }, [0, 255])[0],
        Uint8Array.of(0, 255),
        "two bytes",
      );
    });

    it("reads a list or a fixed-list as a collection", ({ seat }) => {
      check.equal(
        seat,
        [
          decode({ shape: "list", of: UINT8 }, 1n, 7n, 1n, 8n, 0n)[0],
          decode({ shape: "fixed-list", of: UINT8, size: 2 }, 1n, 7n, 1n, 8n, 0n)[0],
        ],
        [
          [7n, 8n],
          [7n, 8n],
        ],
        "flags and elements",
      );
    });

    it("reads a set that discards a repeated element", ({ seat }) => {
      check.equal(
        seat,
        decode({ shape: "set", of: UINT8 }, 1n, 7n, 1n, 7n, 0n)[0],
        [7n],
        "one seven",
      );
    });

    it("reads a map as a dict", ({ seat }) => {
      check.equal(
        seat,
        decoded({ shape: "map", key: UINT8, of: { shape: "bool" } }, 1n, 3n, 1n, 0n),
        canonical(new Pairs([[3n, true]])),
        "one entry",
      );
    });

    it("reads a literal as one of its values", ({ seat }) => {
      const values = ["paid", "shipped"].map((value) => ({ type: "string", value }));

      check.equal(
        seat,
        decode({ shape: "literal", values }, 1n)[0],
        "shipped",
        "the second value",
      );
    });

    it("reads a uuid as 16 bytes", ({ seat }) => {
      const sixteen = Array.from({ length: 16 }, (_, i) => i);

      check.equal(
        seat,
        decode({ shape: "uuid" }, sixteen)[0],
        Uint8Array.from(sixteen),
        "16 bytes",
      );
    });

    it("reads an address of one version as its bytes", ({ seat }) => {
      check.equal(
        seat,
        [
          decode({ shape: "ip-address", version: 4 }, [127, 0, 0, 1])[0],
          decode({ shape: "ip-address", version: 6 })[0],
        ],
        [Uint8Array.of(127, 0, 0, 1), new Uint8Array(16)],
        "four and sixteen bytes",
      );
    });

    it("reads a decimal as its unscaled value with bounds rounded inward", ({
      seat,
    }) => {
      const money = { shape: "decimal", scale: 2, min: "0.005", max: "1.999" };

      check.equal(
        seat,
        [
          decode(money, 0n)[0],
          decode(money, 199n)[0],
          decode(money, 200n)[0],
          decode({ shape: "decimal", scale: 0 }, INT64_MAX)[0],
        ],
        [1n, 199n, 1n, INT64_MAX],
        "the bounds 1 and 199",
      );
    });

    it("reads a decimal with a negative bound", ({ seat }) => {
      check.equal(
        seat,
        decode({ shape: "decimal", scale: 1, min: "-0.25", max: "-0.05" }, 0n)[0],
        -1n,
        "the bounds -2 and -1",
      );
    });

    it("reads a date as its days since 1970-01-01", ({ seat }) => {
      const bounded = { shape: "date", min: "1970-01-02", max: "1970-01-31" };

      check.equal(
        seat,
        [decode(bounded, 0n)[0], decode(bounded, 30n)[0]],
        [1n, 30n],
        "the bounds 1 and 30",
      );
    });

    it("reads a date between the years 1 and 9999 by default", ({ seat }) => {
      const date = { shape: "date" };

      check.equal(
        seat,
        [
          decode(date, -719_162n)[0],
          decode(date, -719_163n)[0],
          decode(date, 2_932_896n)[0],
          decode(date, 2_932_897n)[0],
        ],
        [-719_162n, 0n, 2_932_896n, 0n],
        "the first and the last day",
      );
    });

    it("reads a date of a leap day", ({ seat }) => {
      check.equal(
        seat,
        decode({ shape: "date", min: "2024-02-29", max: "2024-02-29" })[0],
        19_782n,
        "29 February 2024",
      );
    });

    it("reads a date after February as its days since 1970", ({ seat }) => {
      check.equal(
        seat,
        decode({ shape: "date", min: "2024-03-01", max: "2024-03-01" })[0],
        19_783n,
        "1 March 2024",
      );
    });

    it("reads a time of day as its units since midnight", ({ seat }) => {
      check.equal(
        seat,
        [
          decode({ shape: "time-of-day", unit: "ms" }, 86_399_999n)[0],
          decode({ shape: "time-of-day", unit: "s", min: "23:00:00" }, 0n)[0],
        ],
        [86_399_999n, 82_800n],
        "the last millisecond, and the target of 23:00",
      );
    });

    it("reads the fraction of a time of day at its unit", ({ seat }) => {
      check.equal(
        seat,
        decode({ shape: "time-of-day", unit: "ms", min: "00:00:01.25" }, 0n)[0],
        1250n,
        "1.25 seconds",
      );
    });

    it("reads a duration over a Go duration in its unit", ({ seat }) => {
      check.equal(
        seat,
        [
          decode({ shape: "duration", unit: "ns" }, INT64_MAX)[0],
          decode({ shape: "duration", unit: "s" }, -9_223_372_036n)[0],
          decode({ shape: "duration", unit: "s" }, 9_223_372_037n)[0],
        ],
        [INT64_MAX, -9_223_372_036n, 0n],
        "2^63 − 1 nanoseconds, and that many seconds rounded down",
      );
    });

    it("reads an offset of at most 18 hours either way", ({ seat }) => {
      check.equal(
        seat,
        [
          decode({ shape: "offset" }, -64_800n)[0],
          decode({ shape: "offset" }, 64_801n)[0],
        ],
        [-64_800n, 0n],
        "64,800 seconds",
      );
    });

    it("reads a zone as a name of the list with UTC first", ({ seat }) => {
      check.equal(
        seat,
        [decode({ shape: "zone" })[0], decode({ shape: "zone" }, 1n)[0]],
        ["UTC", "Europe/Amsterdam"],
        "the target and the second zone",
      );
    });

    it("reads a root that states its source", ({ seat }) => {
      check.equal(
        seat,
        decode(
          { ...UINT8, source: { language: "go", type: "example.com/x.Qty" } },
          7n,
        )[0],
        7n,
        "7",
      );
    });

    it("reads a ref to a definition without recursion as its name", ({ seat }) => {
      check.equal(
        seat,
        decode(
          {
            shape: "list",
            of: { shape: "ref", name: "id" },
            definitions: { id: UINT8 },
          },
          1n,
          4n,
          1n,
          5n,
          0n,
        )[0],
        [4n, 5n],
        "two ids",
      );
    });

    it("reads a ref to a name that the file does not define as its external generator", ({
      seat,
    }) => {
      const external = read(
        { shape: "list", of: { shape: "ref", name: "Ext" } },
        new Map([["Ext", new Just("x")]]),
      );

      check.equal(
        seat,
        external[DECODE](new Case(new Replaying([{ kind: "integer", value: 1n }]))),
        ["x"],
        "one external value",
      );
    });

    it("reads a ref to a name that the file defines as its definition over an external generator", ({
      seat,
    }) => {
      const defined = read(
        { shape: "ref", name: "id", definitions: { id: UINT8 } },
        new Map([["id", new Just("external")]]),
      );

      check.equal(
        seat,
        defined[DECODE](new Case(new Replaying([{ kind: "integer", value: 7n }]))),
        7n,
        "the definition's value",
      );
    });

    it("reads a ref inside a definition to a name that the file does not define as its external generator", ({
      seat,
    }) => {
      const external = read(
        {
          shape: "ref",
          name: "ids",
          definitions: { ids: { shape: "list", of: { shape: "ref", name: "Ext" } } },
        },
        new Map([["Ext", new Just("x")]]),
      );

      check.equal(
        seat,
        external[DECODE](new Case(new Replaying([{ kind: "integer", value: 1n }]))),
        ["x"],
        "one external value",
      );
    });

    it("reads an instant whose bounds are one second", ({ seat }) => {
      const one = {
        shape: "instant",
        unit: "s",
        min: "2020-01-01T00:00:00Z",
        max: "2020-01-01T00:00:00Z",
      };

      check.equal(
        seat,
        decoded(one),
        canonical(instant(seconds(2020, 1, 1), 0n)),
        "the one second",
      );
    });

    it("reads an instant whose bounds are two fractions of one second", ({ seat }) => {
      const inside = {
        shape: "instant",
        unit: "ms",
        min: "2020-01-01T00:00:00.1Z",
        max: "2020-01-01T00:00:00.5Z",
      };

      check.equal(
        seat,
        decoded(inside),
        canonical(instant(seconds(2020, 1, 1), 100n)),
        "the lower bound",
      );
    });

    const refusals = [
      {
        name: "a value that is no object",
        give: [] as unknown,
        want: "prop: [] is not a shape",
      },
      { name: "undefined", give: undefined, want: "prop: undefined is not a shape" },
      {
        name: "a shape id that is no string",
        give: { shape: 5 },
        want: "prop: shape is 5, which is no shape",
      },
      {
        name: "an instant bound that is no string",
        give: { shape: "instant", unit: "s", min: 5 },
        want: "prop: shape bound 5 is no instant in UTC",
      },
      {
        name: "a date bound that is no string",
        give: { shape: "date", min: 5 },
        want: "prop: shape bound 5 is no date",
      },
      {
        name: "a time bound that is no string",
        give: { shape: "time-of-day", unit: "s", min: 5 },
        want: "prop: shape bound 5 is no time of day",
      },
      {
        name: "a local-date-time bound that is no string",
        give: { shape: "local-date-time", unit: "s", min: 5 },
        want: "prop: shape bound 5 is no local date and time",
      },
      {
        name: "a definition of an enum whose variants are no list",
        give: {
          shape: "ref",
          name: "e",
          definitions: { e: { shape: "enum", variants: 5 } },
        },
        want: "prop: definitions.e.variants is 5, not a list of pairs",
      },
      {
        name: "a definition of an enum whose variant is no pair",
        give: {
          shape: "ref",
          name: "e",
          definitions: { e: { shape: "enum", variants: [["x"]] } },
        },
        want: 'prop: definitions.e.variants has ["x"], not a name and a shape',
      },
      {
        name: "an unknown shape",
        give: { shape: "widget" },
        want: 'prop: shape is "widget", which is no shape',
      },
      {
        name: "a missing key",
        give: { shape: "int", width: 8 },
        want: "prop: shape states no signed, which the int shape needs",
      },
      {
        name: "a width outside the int widths",
        give: { shape: "int", width: 12, signed: true },
        want: "prop: shape states width 12 and signed true",
      },
      {
        name: "a key that the shape does not take",
        give: { ...INT8, mx: 1 },
        want: "prop: shape.mx does not apply to the int shape",
      },
      {
        name: "a bound outside the width",
        give: { ...INT8, min: 200 },
        want: "prop: shape bounds [200, 127] are empty or outside [-128, 127]",
      },
      {
        name: "a bound that is no integer",
        give: { shape: "record", fields: [["id", { ...UINT8, max: "x" }]] },
        want: 'prop: shape.id: prop: "x" is no integer',
      },
      {
        name: "a record that names a field twice",
        give: {
          shape: "record",
          fields: [
            ["id", UINT8],
            ["id", UINT8],
          ],
        },
        want: 'prop: shape.fields names "id" twice or not at all',
      },
      {
        name: "a record without fields",
        give: { shape: "record", fields: [] },
        want: "prop: shape.fields is [], not a list of pairs",
      },
      {
        name: "a variant without a shape",
        give: { shape: "enum", variants: [["x"]] },
        want: 'prop: shape.variants has ["x"], not a name and a shape',
      },
      {
        name: "a decimal without a scale",
        give: { shape: "decimal", scale: null },
        want: "prop: shape is a decimal and states no scale",
      },
      {
        name: "a decimal bound with an exponent",
        give: { shape: "decimal", scale: 2, min: "1e3" },
        want: 'prop: shape.min is "1e3", not a decimal',
      },
      {
        name: "a fixed-list without a size",
        give: { shape: "fixed-list", of: UINT8, size: null },
        want: "prop: shape is a fixed-list and states no size",
      },
      {
        name: "a pattern with a size",
        give: { shape: "string", pattern: "a", max_size: 3 },
        want: "prop: shape states a pattern and an alphabet or a size",
      },
      {
        name: "a pattern that is no string",
        give: { shape: "string", pattern: 3 },
        want: "prop: shape.pattern is 3, not a pattern",
      },
      {
        name: "a pattern outside the subset",
        give: { shape: "string", pattern: "a**" },
        want: 'prop: shape: pattern "a**" at 3: "*" must be escaped here',
      },
      {
        name: "an alphabet that repeats a character",
        give: { shape: "string", alphabet: "aa" },
        want: "prop: shape.alphabet repeats a character",
      },
      {
        name: "an alphabet that is no string",
        give: { shape: "char", alphabet: 3 },
        want: "prop: shape.alphabet is 3, not characters",
      },
      {
        name: "an alphabet with a lone surrogate",
        give: { shape: "char", alphabet: "a\ud800" },
        want: "prop: shape.alphabet has a lone surrogate, which is no character",
      },
      {
        name: "a float width of 16",
        give: { shape: "float", width: 16 },
        want: "prop: shape.width is 16, not 32 or 64",
      },
      {
        name: "an allow_nan that is no boolean",
        give: { shape: "float", width: 64, allow_nan: "yes" },
        want: "prop: shape states allow_nan or allow_infinity as no boolean",
      },
      {
        name: "the infinities with two finite bounds",
        give: { shape: "float", width: 64, allow_infinity: true, min: 0, max: 1 },
        want: "prop: shape allows the infinities and bounds out both",
      },
      {
        name: "an address version of 5",
        give: { shape: "ip-address", version: 5 },
        want: "prop: shape.version is 5, not 4 or 6",
      },
      {
        name: "a unit of minutes",
        give: { shape: "instant", unit: "min" },
        want: 'prop: shape.unit is "min", not one of ms, ns, s, us',
      },
      {
        name: "an instant bound without a zone",
        give: { shape: "instant", unit: "s", min: "2020-01-01T00:00:00" },
        want: 'prop: shape bound "2020-01-01T00:00:00" is no instant in UTC',
      },
      {
        name: "an instant bound finer than its unit",
        give: { shape: "instant", unit: "s", min: "2020-01-01T00:00:00.5Z" },
        want: "prop: shape states a fraction finer than its unit",
      },
      {
        name: "an instant whose bounds run backwards",
        give: {
          shape: "instant",
          unit: "s",
          min: "2020-01-02T00:00:00Z",
          max: "2020-01-01T00:00:00Z",
        },
        want: "prop: shape bounds 1577923200,0 to 1577836800,0 are empty or out of range",
      },
      {
        name: "an instant whose bounds run backwards inside one second",
        give: {
          shape: "instant",
          unit: "ms",
          min: "2020-01-01T00:00:00.5Z",
          max: "2020-01-01T00:00:00.1Z",
        },
        want: "prop: shape bounds 1577836800,500 to 1577836800,100 are empty or out of range",
      },
      {
        name: "a date that does not exist",
        give: { shape: "date", min: "2021-02-29" },
        want: "prop: shape states 2021-02-29, which is no date",
      },
      {
        name: "a date in another form",
        give: { shape: "date", min: "2020/01/01" },
        want: 'prop: shape bound "2020/01/01" is no date',
      },
      {
        name: "a date of month 13",
        give: { shape: "date", max: "2020-13-01" },
        want: "prop: shape states 2020-13-01, which is no date",
      },
      {
        name: "a time of 24 hours",
        give: { shape: "time-of-day", unit: "s", max: "24:00:00" },
        want: "prop: shape states 24:00:00, which is no time",
      },
      {
        name: "a time in words",
        give: { shape: "time-of-day", unit: "s", min: "noon" },
        want: 'prop: shape bound "noon" is no time of day',
      },
      {
        name: "a local-date-time bound with a zone",
        give: { shape: "local-date-time", unit: "s", min: "2020-01-01T00:00:00Z" },
        want: 'prop: shape bound "2020-01-01T00:00:00Z" is no local date and time',
      },
      {
        name: "sizes that run backwards",
        give: { shape: "list", of: UINT8, min_size: 3, max_size: 2 },
        want: "prop: shape: sizes [3, 2] are empty",
      },
      {
        name: "a negative size",
        give: { shape: "list", of: UINT8, min_size: -1 },
        want: "prop: shape.min_size is -1, below 0",
      },
      {
        name: "a nested value that is no shape",
        give: { shape: "optional", of: 3 },
        want: "prop: shape.of is 3, not a shape",
      },
      {
        name: "a literal without values",
        give: { shape: "literal", values: [] },
        want: "prop: shape.values is [], not a list of literals",
      },
      {
        name: "a literal value that is no typed literal",
        give: { shape: "literal", values: [1] },
        want: "prop: shape: prop: 1 is no typed literal",
      },
      {
        name: "definitions that are no map",
        give: { ...UINT8, definitions: [] },
        want: "prop: definitions is not a map of names to shapes",
      },
      {
        name: "a definition that is no shape",
        give: { ...UINT8, definitions: { id: 3 } },
        want: "prop: definitions.id is 3, not a shape",
      },
      {
        name: "a source without a type",
        give: { ...UINT8, source: { language: "go" } },
        want: 'prop: source is {"language":"go"}, not a language and a type',
      },
      {
        name: "a source below the root",
        give: { shape: "list", of: { ...UINT8, source: {} } },
        want: "prop: shape.of.source does not apply to the int shape",
      },
      {
        name: "a width that is no integer",
        give: { shape: "int", width: "x", signed: true },
        want: 'prop: shape.width is "x", not an integer',
      },
      {
        name: "a signed that is no boolean",
        give: { shape: "int", width: 8, signed: "yes" },
        want: 'prop: shape states width 8 and signed "yes"',
      },
      {
        name: "a ref to no definition",
        give: { shape: "ref", name: "missing" },
        want: 'prop: a ref names "missing", which is no definition',
      },
    ];
    for (const tt of refusals) {
      it(`throws a ShapeError for ${tt.name}`, ({ seat }) => {
        const message = thrown(() => read(tt.give));

        check.equal(seat, message, tt.want, "the refusal");
      });
    }

    const endless = [
      {
        name: "a record that contains itself",
        give: {
          shape: "ref",
          name: "loop",
          definitions: {
            loop: {
              shape: "record",
              fields: [["next", { shape: "ref", name: "loop" }]],
            },
          },
        },
        want: "loop",
      },
      {
        name: "a list that must contain itself",
        give: {
          shape: "ref",
          name: "t",
          definitions: {
            t: { shape: "list", min_size: 1, of: { shape: "ref", name: "t" } },
          },
        },
        want: "t",
      },
      {
        name: "an enum whose every variant refers back",
        give: {
          shape: "ref",
          name: "e",
          definitions: {
            e: { shape: "enum", variants: [["only", { shape: "ref", name: "e" }]] },
          },
        },
        want: "e",
      },
      {
        name: "two records that contain each other",
        give: {
          shape: "ref",
          name: "a",
          definitions: {
            a: { shape: "record", fields: [["b", { shape: "ref", name: "b" }]] },
            b: { shape: "record", fields: [["a", { shape: "ref", name: "a" }]] },
          },
        },
        want: "a",
      },
    ];
    for (const tt of endless) {
      it(`throws a ShapeError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => read(tt.give)),
          `prop: definitions.${tt.want} has no finite value, because it refers back without an optional, a list, a set, a map or an enum that can exit`,
          "no finite value",
        );
      });
    }

    it("throws nothing but a ShapeError for any JSON value", async ({ seat }) => {
      await prop.fuzz(seat, "read throws nothing but a ShapeError", (c) => {
        const text = Buffer.from(c.draw(prop.bytes(), "text")).toString("utf8");
        let document: unknown;
        try {
          document = JSON.parse(text);
        } catch {
          return;
        }
        try {
          read(document);
        } catch (err) {
          check.errorIs(c, err, ShapeError, "the refusal is a ShapeError");
        }
      });
    });
  });

  describe("Int128Shape", () => {
    const wide = { shape: "int", width: 128, signed: true };

    it("decodes its signed high half before its low half", ({ seat }) => {
      check.equal(
        seat,
        [
          decode(wide, -1n, UINT64_MAX)[0],
          decode(wide, 1n, 0n)[0],
          decode(wide, -(2n ** 63n), 0n)[0],
          decode({ ...wide, signed: false }, UINT64_MAX, UINT64_MAX)[0],
        ],
        [-1n, 2n ** 64n, -(2n ** 127n), 2n ** 128n - 1n],
        "four values",
      );
    });

    it("bounds its low half by the bound whose high half it shares", ({ seat }) => {
      const bounded = {
        shape: "int",
        width: 128,
        signed: false,
        min: String(2n ** 64n + 10n),
        max: String(2n ** 65n),
      };

      check.equal(
        seat,
        [
          decode(bounded, 1n, 3n)[0],
          decode(bounded, 2n, 9n)[0],
          decode(bounded, 1n, 11n)[0],
        ],
        [2n ** 64n + 10n, 2n ** 65n, 2n ** 64n + 11n],
        "the low halves at the bounds",
      );
    });
  });

  describe("InstantShape", () => {
    it("decodes its seconds and its units", ({ seat }) => {
      const [value, c] = decode({ shape: "instant", unit: "s" }, 253_402_300_799n);

      check.equal(
        seat,
        [
          decoded({ shape: "instant", unit: "ns" }, -1n, 999_999_999n),
          canonical(value),
          c.choices.length,
        ],
        [
          canonical(instant(-1n, 999_999_999n)),
          canonical(instant(253_402_300_799n, 0n)),
          1,
        ],
        "two choices at nanoseconds, and one at seconds",
      );
    });

    it("stops the units of the second of its bound", ({ seat }) => {
      const start = seconds(2020, 1, 1);
      const bounded = { shape: "instant", unit: "ms", min: "2020-01-01T00:00:00.5Z" };

      check.equal(
        seat,
        [decoded(bounded, start, 3n), decoded(bounded, start + 1n, 3n)],
        [canonical(instant(start, 500n)), canonical(instant(start + 1n, 3n))],
        "500 at the bound's second, and 3 after it",
      );
    });

    it("decodes from the first second of the year 1 by default", ({ seat }) => {
      check.equal(
        seat,
        decoded({ shape: "instant", unit: "s" }, -62_135_596_800n),
        canonical(instant(-62_135_596_800n, 0n)),
        "0001-01-01T00:00:00Z",
      );
    });
  });

  describe("LocalDateTimeShape", () => {
    it("stops the time of day of the date of its bound", ({ seat }) => {
      const bounded = {
        shape: "local-date-time",
        unit: "s",
        max: "1970-01-02T12:00:00",
      };
      const local = (day: bigint, time: bigint) =>
        new Fields([
          ["date", day],
          ["time-of-day", time],
        ]);

      check.equal(
        seat,
        [decoded(bounded, 1n, 86_399n), decoded(bounded, 0n, 86_399n)],
        [canonical(local(1n, 0n)), canonical(local(0n, 86_399n))],
        "the bound's date, and the date before it",
      );
    });
  });

  describe("IpShape", () => {
    it("decodes the bytes of the version that an index chooses", ({ seat }) => {
      check.equal(
        seat,
        decode({ shape: "ip-address" }, 1n, new Array<number>(16).fill(1))[0],
        new Uint8Array(16).fill(1),
        "an address of version 6",
      );
    });
  });

  describe("ZonedShape", () => {
    it("decodes the instant of a zone without a change over the whole range", ({
      seat,
    }) => {
      const [value, c] = decode({ shape: "zoned-date-time", unit: "s" }, 0n, 42n);

      check.equal(
        seat,
        [canonical(value), c.choices.length],
        [
          canonical(
            new Fields([
              ["instant", instant(42n, 0n)],
              ["zone", "UTC"],
            ]),
          ),
          2,
        ],
        "UTC makes no choice of a change",
      );
    });

    it("decodes an instant one unit from a change", ({ seat }) => {
      check.equal(
        seat,
        decoded({ shape: "zoned-date-time", unit: "ns" }, 1n, 1n, 0n, -1n),
        canonical(
          new Fields([
            ["instant", instant(CHANGE.at - 1n, 999_999_999n)],
            ["zone", "Europe/Amsterdam"],
          ]),
        ),
        "a nanosecond before the change",
      );
    });

    it("decodes an instant away from the changes over the whole range", ({ seat }) => {
      check.equal(
        seat,
        decoded({ shape: "zoned-date-time", unit: "ms" }, 1n, 0n, 7n, 8n),
        canonical(
          new Fields([
            ["instant", instant(7n, 8n)],
            ["zone", "Europe/Amsterdam"],
          ]),
        ),
        "the instant's two choices",
      );
    });

    it("decodes about one case in four from the changes", ({ seat }) => {
      const shape = read({ shape: "zoned-date-time", unit: "s" });
      let near = 0;
      let changed = 0;
      for (let index = 0n; index < 4000n; index += 1n) {
        const c = new Case(new Generating(caseSource(11n, index)));
        shape[DECODE](c);
        if ((ZONES[Number(c.choices[0]?.value)]?.changes.length ?? 0) > 0) {
          changed += 1;
          if (c.choices[1]?.value === 1n) near += 1;
        }
      }

      check.isTrue(
        seat,
        changed > 3000 && Math.abs(near / changed - 0.25) <= 0.03,
        "a quarter of the zones with changes",
      );
    });
  });

  describe("WallShape", () => {
    for (const [side, offset] of [
      [0n, CHANGE.before],
      [1n, CHANGE.after],
    ] as const) {
      it(`decodes the change's instant in the offset ${side === 0n ? "before" : "after"} it`, ({
        seat,
      }) => {
        const [day, time] = divmod(CHANGE.at + offset, 86_400n);

        check.equal(
          seat,
          decoded({ shape: "wall-time", unit: "s" }, 1n, 1n, 0n, 0n, side),
          canonical(
            new Fields([
              [
                "local-date-time",
                new Fields([
                  ["date", day],
                  ["time-of-day", time],
                ]),
              ],
              ["zone", "Europe/Amsterdam"],
            ]),
          ),
          "the wall time at the change",
        );
      });
    }

    it("decodes a wall time away from the changes over the whole range", ({ seat }) => {
      check.equal(
        seat,
        decoded({ shape: "wall-time", unit: "s" }, 1n, 0n, 5n, 6n),
        canonical(
          new Fields([
            [
              "local-date-time",
              new Fields([
                ["date", 5n],
                ["time-of-day", 6n],
              ]),
            ],
            ["zone", "Europe/Amsterdam"],
          ]),
        ),
        "the local date and time's two choices",
      );
    });

    it("decodes about half of the wall times near a change in the offset after it", ({
      seat,
    }) => {
      const shape = read({ shape: "wall-time", unit: "s" });
      let near = 0;
      let after = 0;
      for (let index = 0n; index < 4000n; index += 1n) {
        const c = new Case(new Generating(caseSource(13n, index)));
        shape[DECODE](c);
        const changes = ZONES[Number(c.choices[0]?.value)]?.changes.length ?? 0;
        if (changes > 0 && c.choices[1]?.value === 1n) {
          near += 1;
          if (c.choices[4]?.value === 1n) after += 1;
        }
      }

      check.isTrue(
        seat,
        near > 600 && Math.abs(after / near - 0.5) <= 0.06,
        "half of the wall times near a change",
      );
    });
  });

  describe("OptionalShape", () => {
    it("decodes a present value from the flag 1 alone", ({ seat }) => {
      const optional = { shape: "optional", of: UINT8 };

      check.equal(
        seat,
        [decode(optional)[0], decode(optional, 1n, 5n)[0]],
        [undefined, 5n],
        "absent, then 5",
      );
    });

    it("ends a linked list at an absent next", ({ seat }) => {
      const linked = {
        shape: "ref",
        name: "node",
        definitions: {
          node: {
            shape: "record",
            fields: [
              ["value", UINT8],
              ["next", { shape: "optional", of: { shape: "ref", name: "node" } }],
            ],
          },
        },
      };

      check.equal(
        seat,
        decoded(linked, 1n, 1n, 2n),
        canonical(
          new Fields([
            ["value", 1n],
            [
              "next",
              new Fields([
                ["value", 2n],
                ["next", undefined],
              ]),
            ],
          ]),
        ),
        "two nodes",
      );
    });

    it("stops definitions that refer to each other once the budget is used", ({
      seat,
    }) => {
      const mutual = {
        shape: "ref",
        name: "even",
        definitions: {
          even: { shape: "optional", of: { shape: "ref", name: "odd" } },
          odd: { shape: "record", fields: [["next", { shape: "ref", name: "even" }]] },
        },
      };
      let value = decode(mutual, ...new Array<bigint>(400).fill(1n))[0];
      let depth = 0;
      while (value !== undefined) {
        value = (value as Fields).fields[0]?.[1];
        depth += 1;
      }

      check.equal(seat, depth, BUDGET / 2, "each pair of definitions counts two nodes");
    });
  });

  describe("RecordShape", () => {
    it("decodes its fields in order", ({ seat }) => {
      const record = {
        shape: "record",
        fields: [
          ["id", UINT8],
          ["ok", { shape: "bool" }],
        ],
      };

      check.equal(
        seat,
        decoded(record, 4n, 1n),
        canonical(
          new Fields([
            ["id", 4n],
            ["ok", true],
          ]),
        ),
        "an id and a flag",
      );
    });
  });

  describe("EnumShape", () => {
    const optional = {
      shape: "enum",
      variants: [
        ["none", null],
        ["some", UINT8],
      ],
    };

    it("decodes the payload of the variant that an index chooses", ({ seat }) => {
      const bare = decode(optional)[0] as Variant;

      check.equal(
        seat,
        [bare.name, bare.hasPayload, decoded(optional, 1n, 9n)],
        ["none", false, canonical(new Variant("some", 9n))],
        "a bare variant and a payload",
      );
    });

    it("takes its first exit once the budget is used", ({ seat }) => {
      const nested = {
        shape: "ref",
        name: "node",
        definitions: {
          node: {
            shape: "enum",
            variants: [
              [
                "branch",
                { shape: "fixed-list", size: 2, of: { shape: "ref", name: "node" } },
              ],
              ["leaf", null],
            ],
          },
        },
      };
      const count = (node: unknown): number => {
        const variant = node as Variant;
        return variant.name === "leaf"
          ? 1
          : 1 +
              (variant.payload as unknown[]).reduce<number>(
                (sum, child) => sum + count(child),
                0,
              );
      };

      check.isTrue(
        seat,
        count(decode(nested, ...new Array<bigint>(400).fill(0n))[0]) < 3 * BUDGET,
        "the leaves end the value",
      );
    });
  });

  describe("Ref", () => {
    it("decodes a tree through its definition", ({ seat }) => {
      check.equal(
        seat,
        decoded(TREE, 3n, 1n, 4n, 0n, 0n),
        canonical(
          new Fields([
            ["value", 3n],
            [
              "children",
              [
                new Fields([
                  ["value", 4n],
                  ["children", []],
                ]),
              ],
            ],
          ]),
        ),
        "a tree of one child",
      );
    });
  });

  describe("Root", () => {
    it("stops a tree from growing once its value has used the budget", ({ seat }) => {
      const shape = read(TREE);
      let largest = 0;
      for (let index = 0n; index < 300n; index += 1n) {
        largest = Math.max(
          largest,
          nodes(shape[DECODE](new Case(new Generating(caseSource(5n, index))))),
        );
      }

      check.equal(seat, largest, BUDGET, "the largest tree");
    });
  });

  describe("MapShape", () => {
    it("stops a map that refers back once the budget is used", ({ seat }) => {
      const keyed = {
        shape: "ref",
        name: "node",
        definitions: {
          node: {
            shape: "map",
            key: { shape: "int", width: 64, signed: false },
            of: { shape: "ref", name: "node" },
          },
        },
      };
      const shape = read(keyed);
      const count = (value: unknown): number =>
        1 +
        (value as Pairs).items.reduce<number>(
          (sum, [, child]) => sum + count(child),
          0,
        );
      let largest = 0;
      for (let index = 0n; index < 200n; index += 1n) {
        largest = Math.max(
          largest,
          count(shape[DECODE](new Case(new Generating(caseSource(3n, index))))),
        );
      }

      check.equal(seat, largest, BUDGET, "the largest map");
    });
  });
});
