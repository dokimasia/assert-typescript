// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the converters of the time shapes. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  DATE,
  durationOf,
  durationShapeOf,
  instantOf,
  localOf,
  nanosecondsOf,
  timeOfDayOf,
  UNIT_NANOSECONDS,
  wallOf,
  zonedOf,
} from "../../../src/prop/convert/time.js";
import { Fields } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** The nanoseconds of a second and of a millisecond. */
const SECOND = 1_000_000_000n;
const MILLISECOND = 1_000_000n;

/** Returns the value of a time shape of two named parts. */
function parts(first: string, a: unknown, second: string, b: unknown): Fields {
  return new Fields([
    [first, a],
    [second, b],
  ]);
}

describe("time", () => {
  describe("UNIT_NANOSECONDS", () => {
    it("maps each unit of a time shape to the nanoseconds of one unit", ({ seat }) => {
      check.isEqualTo(
        seat,
        [...UNIT_NANOSECONDS],
        [
          ["s", SECOND],
          ["ms", MILLISECOND],
          ["us", 1000n],
          ["ns", 1n],
        ],
        "the four units",
      );
    });
  });

  describe("nanosecondsOf", () => {
    it("returns the nanoseconds of a duration with days of 24 hours", ({ seat }) => {
      const duration = Temporal.Duration.from({ days: 1, hours: 1, nanoseconds: 5 });

      check.isEqualTo(
        seat,
        nanosecondsOf(duration),
        90_000_000_000_005n,
        "a day, an hour and 5 ns",
      );
    });

    it("throws a RangeError for a duration with a calendar unit", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => nanosecondsOf(Temporal.Duration.from({ months: 1 }))),
        "prop: P1M states a calendar unit, which has no fixed length",
        "a month has no fixed length",
      );
    });
  });

  describe("durationOf", () => {
    it("returns a duration balanced from the hours down", ({ seat }) => {
      check.isEqualTo(
        seat,
        durationOf(90_000_000_000_005n).toString(),
        "PT25H0.000000005S",
        "25 hours and 5 ns",
      );
    });

    it("returns a negative duration of negative nanoseconds", ({ seat }) => {
      check.isEqualTo(
        seat,
        durationOf(-1_500_000_000n).toString(),
        "-PT1.5S",
        "minus 1.5 seconds",
      );
    });
  });

  describe("instantOf", () => {
    it("converts the seconds and the units to an Instant and back", ({ seat }) => {
      const converter = instantOf(MILLISECOND);
      const fields = parts("seconds", 1n, "units", 500n);
      const instant = Temporal.Instant.from("1970-01-01T00:00:01.5Z");

      check.isEqualTo(
        seat,
        [String(converter.to(fields)), converter.back(instant)],
        [instant.toString(), fields],
        "an instant 1.5 seconds after 1970",
      );
    });

    it("refuses an instant finer than its unit", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() =>
          instantOf(SECOND).back(Temporal.Instant.from("1970-01-01T00:00:00.5Z")),
        ),
        "prop: 1970-01-01T00:00:00.5Z is finer than the shape's unit of 1000000000 ns",
        "half a second",
      );
    });
  });

  describe("DATE", () => {
    it("converts the days since 1970-01-01 to a PlainDate and back", ({ seat }) => {
      check.isEqualTo(
        seat,
        [String(DATE.to(1n)), DATE.back(Temporal.PlainDate.from("1969-12-31"))],
        ["1970-01-02", -1n],
        "the day after and the day before 1970-01-01",
      );
    });
  });

  describe("timeOfDayOf", () => {
    it("converts the units since midnight to a PlainTime and back", ({ seat }) => {
      const converter = timeOfDayOf(SECOND);

      check.isEqualTo(
        seat,
        [
          String(converter.to(3661n)),
          converter.back(Temporal.PlainTime.from("01:01:01")),
        ],
        ["01:01:01", 3661n],
        "an hour, a minute and a second",
      );
    });
  });

  describe("localOf", () => {
    it("converts the date and the time of day to a PlainDateTime and back", ({
      seat,
    }) => {
      const converter = localOf(SECOND);
      const fields = parts("date", 1n, "time-of-day", 60n);

      check.isEqualTo(
        seat,
        [String(converter.to(fields)), converter.back(converter.to(fields))],
        ["1970-01-02T00:01:00", fields],
        "a minute past midnight of 1970-01-02",
      );
    });
  });

  describe("durationShapeOf", () => {
    it("converts the units to a Duration and back", ({ seat }) => {
      const converter = durationShapeOf(MILLISECOND);

      check.isEqualTo(
        seat,
        [String(converter.to(1500n)), converter.back(Temporal.Duration.from("PT1.5S"))],
        ["PT1.5S", 1500n],
        "1.5 seconds",
      );
    });
  });

  describe("zonedOf", () => {
    it("converts the instant and the zone to a ZonedDateTime and back", ({ seat }) => {
      const converter = zonedOf(SECOND);
      const fields = parts("instant", parts("seconds", 0n, "units", 0n), "zone", "UTC");

      check.isEqualTo(
        seat,
        [String(converter.to(fields)), converter.back(converter.to(fields))],
        ["1970-01-01T00:00:00+00:00[UTC]", fields],
        "the start of 1970 in UTC",
      );
    });
  });

  describe("wallOf", () => {
    it("converts the local date and time and the zone to an object and back", ({
      seat,
    }) => {
      const converter = wallOf(SECOND);
      const fields = parts(
        "local-date-time",
        parts("date", 0n, "time-of-day", 0n),
        "zone",
        "Europe/Amsterdam",
      );
      const wall = converter.to(fields) as { local: unknown; zone: unknown };

      check.isEqualTo(
        seat,
        [String(wall.local), wall.zone, converter.back(wall)],
        ["1970-01-01T00:00:00", "Europe/Amsterdam", fields],
        "midnight of 1970-01-01 in Amsterdam",
      );
    });

    it("refuses an object without a local date and time", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => wallOf(SECOND).back({ local: "x", zone: "UTC" })),
        'prop: {"local":"x","zone":"UTC"} is no value of the wall-time shape',
        "the refusal",
      );
    });
  });
});
