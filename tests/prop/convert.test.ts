/** The spec of the TypeScript values of shapes. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import {
  type Converter,
  converterOf,
  durationOf,
  IDENTITY,
  nanosecondsOf,
  plainOf,
} from "../../src/prop/convert.js";
import { Fields, Pairs, Variant } from "../../src/prop/engine/value.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** The converter of a shape without definitions or names. */
function of(shape: Record<string, unknown>): Converter {
  return converterOf(shape, new Map());
}

/** The int shape of 32 bits. */
const INT32 = { shape: "int", width: 32, signed: true };

/** Returns the bytes from 0 to 15. */
function sixteen(): Uint8Array {
  return Uint8Array.from({ length: 16 }, (_, i) => i);
}

/** Returns the 16 bytes of an IPv6 address of eight groups. */
function groups(...values: number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((group) => [group >> 8, group & 0xff]));
}

describe("convert", () => {
  describe("IDENTITY", () => {
    it("returns a value in both directions", ({ seat }) => {
      check.equal(
        seat,
        [IDENTITY.to(1n), IDENTITY.back(1n)],
        [1n, 1n],
        "the same value",
      );
    });
  });

  describe("nanosecondsOf", () => {
    it("returns the nanoseconds of a duration with days of 24 hours", ({ seat }) => {
      const duration = Temporal.Duration.from({ days: 1, hours: 1, nanoseconds: 5 });

      check.equal(
        seat,
        nanosecondsOf(duration),
        90_000_000_000_005n,
        "a day, an hour and 5 ns",
      );
    });

    it("throws a RangeError for a duration with a calendar unit", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => nanosecondsOf(Temporal.Duration.from({ months: 1 }))),
        "prop: P1M states a calendar unit, which has no fixed length",
        "a month has no fixed length",
      );
    });
  });

  describe("durationOf", () => {
    it("returns a duration balanced from the hours down", ({ seat }) => {
      check.equal(
        seat,
        durationOf(90_000_000_000_005n).toString(),
        "PT25H0.000000005S",
        "25 hours and 5 ns",
      );
    });

    it("returns a negative duration of negative nanoseconds", ({ seat }) => {
      check.equal(
        seat,
        durationOf(-1_500_000_000n).toString(),
        "-PT1.5S",
        "minus 1.5 seconds",
      );
    });
  });

  describe("plainOf", () => {
    it("converts every engine container in a value to its TypeScript form", ({
      seat,
    }) => {
      const value = [
        new Fields([["a", 1n]]),
        new Pairs([["k", new Variant("none")]]),
        new Variant("some", [2n]),
      ];

      check.equal(
        seat,
        plainOf(value),
        [
          { a: 1n },
          new Map([["k", { name: "none" }]]),
          { name: "some", payload: [2n] },
        ],
        "the TypeScript values",
      );
    });
  });

  describe("converterOf", () => {
    it("returns a number of an int of 32 bits", ({ seat }) => {
      const converter = of(INT32);

      check.equal(
        seat,
        [converter.to(3n), converter.back(3), converter.back(3n)],
        [3, 3n, 3n],
        "a number",
      );
    });

    it("throws a TypeError for a number that is no safe integer of an int of 32 bits", ({
      seat,
    }) => {
      check.equal(
        seat,
        thrown(() => of(INT32).back(1.5)),
        "prop: 1.5 is no value of the int shape",
        "a fraction",
      );
    });

    it("returns a bigint of an int of 64 bits", ({ seat }) => {
      const converter = of({ shape: "int", width: 64, signed: true });

      check.equal(seat, [converter.to(3n), converter.back(3n)], [3n, 3n], "a bigint");
    });

    it("returns the elements of a list each converted", ({ seat }) => {
      const converter = of({ shape: "list", of: INT32 });

      check.equal(
        seat,
        [converter.to([1n, 2n]), converter.back([1, 2])],
        [
          [1, 2],
          [1n, 2n],
        ],
        "the elements",
      );
    });

    it("throws a TypeError for a value that is no array of a list", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "fixed-list", of: INT32, size: 1 }).back(1)),
        "prop: 1 is no value of the list shape",
        "no array",
      );
    });

    it("maps a set to a Set both ways", ({ seat }) => {
      const converter = of({ shape: "set", of: INT32 });

      check.equal(
        seat,
        [converter.to([1n]), converter.back(new Set([1])), converter.back([2])],
        [new Set([1]), [1n], [2n]],
        "a set",
      );
    });

    it("throws a TypeError for a value that is no set", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "set", of: INT32 }).back(1)),
        "prop: 1 is no value of the set shape",
        "no set",
      );
    });

    it("maps a map to a Map both ways", ({ seat }) => {
      const converter = of({ shape: "map", key: INT32, of: { shape: "bool" } });

      check.equal(
        seat,
        [
          converter.to(new Pairs([[1n, true]])),
          converter.back(new Map([[1, true]])),
          converter.back(new Pairs([[2n, false]])),
        ],
        [new Map([[1, true]]), new Pairs([[1n, true]]), new Pairs([[2n, false]])],
        "a map",
      );
    });

    it("throws a TypeError for a value that is no map", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "map", key: INT32, of: INT32 }).back([])),
        "prop: [] is no value of the map shape",
        "no map",
      );
    });

    it("maps an absent optional value to undefined both ways", ({ seat }) => {
      const converter = of({ shape: "optional", of: INT32 });

      check.equal(
        seat,
        [
          converter.to(undefined),
          converter.to(3n),
          converter.back(null),
          converter.back(undefined),
          converter.back(3),
        ],
        [undefined, 3, undefined, undefined, 3n],
        "an optional value",
      );
    });

    it("maps a record to a plain object both ways", ({ seat }) => {
      const converter = of({
        shape: "record",
        fields: [
          ["id", INT32],
          ["ok", { shape: "bool" }],
        ],
      });
      const fields = new Fields([
        ["id", 7n],
        ["ok", true],
      ]);

      check.equal(
        seat,
        [
          converter.to(fields),
          converter.back({ ok: true, id: 7 }),
          converter.back(fields),
        ],
        [{ id: 7, ok: true }, fields, fields],
        "a record",
      );
    });

    it("throws a TypeError for a value that is no record", ({ seat }) => {
      const converter = of({ shape: "record", fields: [["ok", { shape: "bool" }]] });

      check.equal(
        seat,
        thrown(() => converter.back(null)),
        "prop: null is no value of the record shape",
        "null",
      );
    });

    it("maps a variant to a plain object both ways", ({ seat }) => {
      const converter = of({
        shape: "enum",
        variants: [
          ["none", null],
          ["some", INT32],
        ],
      });

      check.equal(
        seat,
        [
          converter.to(new Variant("none")),
          converter.to(new Variant("some", 3n)),
          converter.back({ name: "some", payload: 3 }),
          converter.back({ name: "none" }),
          converter.back(new Variant("some", 4n)),
        ],
        [
          { name: "none" },
          { name: "some", payload: 3 },
          new Variant("some", 3n),
          new Variant("none"),
          new Variant("some", 4n),
        ],
        "a variant",
      );
    });

    it("throws a TypeError for a variant that the enum does not name", ({ seat }) => {
      const converter = of({ shape: "enum", variants: [["none", null]] });

      check.equal(
        seat,
        thrown(() => converter.back({ name: "z" })),
        'prop: {"name":"z"} is no value of the enum shape',
        "an unknown variant",
      );
    });

    it("throws a TypeError for a value that is no variant", ({ seat }) => {
      const converter = of({ shape: "enum", variants: [["none", null]] });

      check.equal(
        seat,
        thrown(() => converter.back(undefined)),
        "prop: undefined is no value of the enum shape",
        "undefined",
      );
    });

    it("maps each value of a literal to its TypeScript value both ways", ({ seat }) => {
      const converter = of({
        shape: "literal",
        values: [
          { type: "int", value: 1 },
          { type: "record", fields: [["a", { type: "int", value: 2 }]] },
        ],
      });
      const decoded = new Fields([["a", 2n]]);

      check.equal(
        seat,
        [
          converter.to(decoded),
          converter.back({ a: 2n }),
          converter.back(decoded),
          converter.back(1n),
        ],
        [{ a: 2n }, decoded, decoded, 1n],
        "a literal",
      );
    });

    it("throws a TypeError for a value that the literal does not state", ({ seat }) => {
      const converter = of({ shape: "literal", values: [{ type: "int", value: 1 }] });

      check.equal(
        seat,
        thrown(() => converter.back(5n)),
        "prop: 5n is no value of the literal shape",
        "another value",
      );
    });

    it("returns the value of a recursive definition", ({ seat }) => {
      const converter = converterOf(
        {
          shape: "ref",
          name: "Node",
          definitions: {
            Node: {
              shape: "record",
              fields: [
                ["next", { shape: "optional", of: { shape: "ref", name: "Node" } }],
              ],
            },
          },
        },
        new Map(),
      );
      const value = new Fields([["next", new Fields([["next", undefined]])]]);

      check.equal(
        seat,
        [converter.to(value), converter.back({ next: { next: undefined } })],
        [{ next: { next: undefined } }, value],
        "a list of two nodes",
      );
    });

    it("converts a ref to a name with the converter that the caller states for it", ({
      seat,
    }) => {
      const doubled: Converter = {
        to: (v) => (v as number) * 2,
        back: (v) => (v as number) / 2,
      };
      const converter = converterOf(
        { shape: "list", of: { shape: "ref", name: "X" } },
        new Map([["X", doubled]]),
      );

      check.equal(
        seat,
        [converter.to([1]), converter.back([4])],
        [[2], [2]],
        "the stated converter",
      );
    });

    it("maps a UUID to lowercase text both ways", ({ seat }) => {
      const converter = of({ shape: "uuid" });

      check.equal(
        seat,
        [
          converter.to(sixteen()),
          converter.back("00010203-0405-0607-0809-0A0B0C0D0E0F"),
          converter.back(sixteen()),
        ],
        ["00010203-0405-0607-0809-0a0b0c0d0e0f", sixteen(), sixteen()],
        "a UUID",
      );
    });

    it("throws a TypeError for text that is no UUID", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "uuid" }).back("00010203")),
        'prop: "00010203" is no value of the uuid shape',
        "a short text",
      );
    });

    {
      const tests = [
        {
          name: "a dotted IPv4 address",
          give: Uint8Array.of(127, 0, 0, 1),
          want: "127.0.0.1",
        },
        {
          name: "the IPv6 address of zeros",
          give: groups(0, 0, 0, 0, 0, 0, 0, 0),
          want: "::",
        },
        {
          name: "an IPv6 address with its longest zero run compressed",
          give: groups(1, 0, 0, 1, 0, 0, 0, 1),
          want: "1:0:0:1::1",
        },
        {
          name: "an IPv6 address with the first of two equal runs compressed",
          give: groups(1, 0, 0, 1, 0, 0, 1, 1),
          want: "1::1:0:0:1:1",
        },
        {
          name: "an IPv6 address with a single zero group",
          give: groups(1, 0, 1, 1, 1, 1, 1, 1),
          want: "1:0:1:1:1:1:1:1",
        },
        {
          name: "an IPv6 address with a trailing run",
          give: groups(0x2001, 0xdb8, 0, 0, 0, 0, 0, 0),
          want: "2001:db8::",
        },
      ];
      for (const tt of tests) {
        it(`maps ${tt.name} to its text both ways`, ({ seat }) => {
          const converter = of({ shape: "ip-address" });

          check.equal(
            seat,
            [converter.to(tt.give), converter.back(tt.want)],
            [tt.want, tt.give],
            "the address",
          );
        });
      }
    }

    it("runs an IPv6 address with an IPv4 tail back to its bytes", ({ seat }) => {
      check.equal(
        seat,
        of({ shape: "ip-address" }).back("::ffff:1.2.3.4"),
        groups(0, 0, 0, 0, 0, 0xffff, 0x102, 0x304),
        "the mapped address",
      );
    });

    it("runs an address's bytes back as they are", ({ seat }) => {
      check.equal(
        seat,
        of({ shape: "ip-address" }).back(Uint8Array.of(1, 2, 3, 4)),
        Uint8Array.of(1, 2, 3, 4),
        "the bytes",
      );
    });

    {
      const tests = [
        { name: "an octet above 255", give: "256.0.0.1" as unknown },
        { name: "an octet with a leading zero", give: "01.2.3.4" as unknown },
        { name: "an IPv6 address with a zone", give: "fe80::1%eth0" as unknown },
        { name: "a number", give: 5 as unknown },
      ];
      for (const tt of tests) {
        it(`throws a TypeError for ${tt.name}`, ({ seat }) => {
          check.equal(
            seat,
            thrown(() => of({ shape: "ip-address" }).back(tt.give)),
            `prop: ${JSON.stringify(tt.give)} is no value of the ip-address shape`,
            "no address",
          );
        });
      }
    }

    it("returns the text of a decimal with as many digits after the point as its scale", ({
      seat,
    }) => {
      const converter = of({ shape: "decimal", scale: 2 });

      check.equal(
        seat,
        [converter.to(-5n), converter.to(1234n)],
        ["-0.05", "12.34"],
        "the texts",
      );
    });

    it("returns the text of a decimal of scale 0 without a point", ({ seat }) => {
      check.equal(seat, of({ shape: "decimal", scale: 0 }).to(-7n), "-7", "an integer");
    });

    it("runs the text of a decimal back to its unscaled integer", ({ seat }) => {
      const converter = of({ shape: "decimal", scale: 2 });

      check.equal(
        seat,
        [
          converter.back("12.34"),
          converter.back("-0.05"),
          converter.back("1.5"),
          converter.back("1.230"),
          converter.back(9n),
        ],
        [1234n, -5n, 150n, 123n, 9n],
        "the unscaled integers",
      );
    });

    it("throws a RangeError for a decimal with more digits than its scale", ({
      seat,
    }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "decimal", scale: 2 }).back("1.234")),
        "prop: 1.234 has more digits than the scale of 2",
        "a third digit",
      );
    });

    it("throws a TypeError for a value that is no decimal text", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "decimal", scale: 2 }).back(1.5)),
        "prop: 1.5 is no value of the decimal shape",
        "a number",
      );
    });

    it("maps an instant to an Instant both ways", ({ seat }) => {
      const converter = of({ shape: "instant", unit: "ms" });
      const fields = new Fields([
        ["seconds", -1n],
        ["units", 500n],
      ]);
      const instant = Temporal.Instant.from("1969-12-31T23:59:59.5Z");

      check.equal(
        seat,
        [String(converter.to(fields)), converter.back(instant), converter.back(fields)],
        [instant.toString(), fields, fields],
        "an instant half a second before 1970",
      );
    });

    it("throws a RangeError for an instant finer than its unit", ({ seat }) => {
      const instant = Temporal.Instant.from("1970-01-01T00:00:00.0005Z");

      check.equal(
        seat,
        thrown(() => of({ shape: "instant", unit: "ms" }).back(instant)),
        "prop: 1970-01-01T00:00:00.0005Z is finer than the shape's unit of 1000000 ns",
        "half a millisecond",
      );
    });

    it("throws a TypeError for a value that is no Instant", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "instant", unit: "s" }).back("x")),
        'prop: "x" is no value of the instant shape',
        "text",
      );
    });

    it("maps a date to a PlainDate both ways", ({ seat }) => {
      const converter = of({ shape: "date" });
      const date = Temporal.PlainDate.from("2000-01-01");

      check.equal(
        seat,
        [String(converter.to(-1n)), converter.back(date), converter.back(3n)],
        ["1969-12-31", 10957n, 3n],
        "a date",
      );
    });

    it("throws a TypeError for a value that is no PlainDate", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "date" }).back("2000-01-01")),
        'prop: "2000-01-01" is no value of the date shape',
        "text",
      );
    });

    it("maps a time of day to a PlainTime both ways", ({ seat }) => {
      const converter = of({ shape: "time-of-day", unit: "s" });

      check.equal(
        seat,
        [
          String(converter.to(3661n)),
          converter.back(Temporal.PlainTime.from("01:01:01")),
          converter.back(5n),
        ],
        ["01:01:01", 3661n, 5n],
        "a time of day",
      );
    });

    it("throws a RangeError for a time of day finer than its unit", ({ seat }) => {
      check.equal(
        seat,
        thrown(() =>
          of({ shape: "time-of-day", unit: "s" }).back(
            Temporal.PlainTime.from("00:00:00.5"),
          ),
        ),
        "prop: 00:00:00.5 is finer than the shape's unit of 1000000000 ns",
        "half a second",
      );
    });

    it("throws a TypeError for a value that is no PlainTime", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "time-of-day", unit: "s" }).back(1)),
        "prop: 1 is no value of the time-of-day shape",
        "a number",
      );
    });

    it("maps a local-date-time to a PlainDateTime both ways", ({ seat }) => {
      const converter = of({ shape: "local-date-time", unit: "ms" });
      const fields = new Fields([
        ["date", 1n],
        ["time-of-day", 1500n],
      ]);
      const local = Temporal.PlainDateTime.from("1970-01-02T00:00:01.5");

      check.equal(
        seat,
        [String(converter.to(fields)), converter.back(local), converter.back(fields)],
        [local.toString(), fields, fields],
        "a local date and time",
      );
    });

    it("throws a TypeError for a value that is no PlainDateTime", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "local-date-time", unit: "s" }).back(1)),
        "prop: 1 is no value of the local-date-time shape",
        "a number",
      );
    });

    it("maps a duration to a Duration both ways", ({ seat }) => {
      const converter = of({ shape: "duration", unit: "ms" });

      check.equal(
        seat,
        [
          String(converter.to(1500n)),
          converter.back(Temporal.Duration.from("P1D")),
          converter.back(7n),
        ],
        ["PT1.5S", 86_400_000n, 7n],
        "a duration",
      );
    });

    it("throws a TypeError for a value that is no Duration", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "duration", unit: "s" }).back("PT1S")),
        'prop: "PT1S" is no value of the duration shape',
        "text",
      );
    });

    it("returns the seconds of an offset as a number", ({ seat }) => {
      const converter = of({ shape: "offset" });

      check.equal(
        seat,
        [converter.to(3600n), converter.back(-1800), converter.back(60n)],
        [3600, -1800n, 60n],
        "an offset",
      );
    });

    it("throws a TypeError for an offset that is no safe integer", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "offset" }).back(0.5)),
        "prop: 0.5 is no value of the offset shape",
        "a fraction",
      );
    });

    it("maps a zoned-date-time to a ZonedDateTime both ways", ({ seat }) => {
      const converter = of({ shape: "zoned-date-time", unit: "s" });
      const fields = new Fields([
        [
          "instant",
          new Fields([
            ["seconds", 0n],
            ["units", 0n],
          ]),
        ],
        ["zone", "Europe/Amsterdam"],
      ]);
      const zoned = Temporal.ZonedDateTime.from(
        "1970-01-01T01:00:00+01:00[Europe/Amsterdam]",
      );

      check.equal(
        seat,
        [String(converter.to(fields)), converter.back(zoned), converter.back(fields)],
        [zoned.toString(), fields, fields],
        "midnight in UTC, in Amsterdam",
      );
    });

    it("throws a TypeError for a value that is no ZonedDateTime", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => of({ shape: "zoned-date-time", unit: "s" }).back(1)),
        "prop: 1 is no value of the zoned-date-time shape",
        "a number",
      );
    });

    it("maps a wall-time to a plain object both ways", ({ seat }) => {
      const converter = of({ shape: "wall-time", unit: "s" });
      const fields = new Fields([
        [
          "local-date-time",
          new Fields([
            ["date", 0n],
            ["time-of-day", 60n],
          ]),
        ],
        ["zone", "UTC"],
      ]);
      const local = Temporal.PlainDateTime.from("1970-01-01T00:01:00");
      const wall = converter.to(fields) as {
        local: Temporal.PlainDateTime;
        zone: string;
      };

      check.equal(
        seat,
        [
          wall.local.toString(),
          wall.zone,
          converter.back({ local, zone: "UTC" }),
          converter.back(fields),
        ],
        [local.toString(), "UTC", fields, fields],
        "a wall time",
      );
    });

    {
      const tests = [
        { name: "null", give: null as unknown, want: "null" },
        {
          name: "a local part of text",
          give: { local: "x", zone: "UTC" } as unknown,
          want: '{"local":"x","zone":"UTC"}',
        },
      ];
      for (const tt of tests) {
        it(`throws a TypeError for ${tt.name} as a wall time`, ({ seat }) => {
          check.equal(
            seat,
            thrown(() => of({ shape: "wall-time", unit: "s" }).back(tt.give)),
            `prop: ${tt.want} is no value of the wall-time shape`,
            "no wall time",
          );
        });
      }
    }

    it("returns the value of a shape whose values are the engine's as it is", ({
      seat,
    }) => {
      check.equal(seat, of({ shape: "zone" }).to("UTC"), "UTC", "a zone's name");
    });
  });
});
