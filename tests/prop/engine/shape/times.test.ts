// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the builders of the date and time shapes, and of the refusals of their bounds. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import type { SampledFrom } from "../../../../src/prop/engine/generator.js";
import {
  InstantShape,
  LocalDateTimeShape,
} from "../../../../src/prop/engine/shape/pair.js";
import { Reader } from "../../../../src/prop/engine/shape/reader.js";
import {
  dateShape,
  durationShape,
  instantShape,
  localShape,
  offsetShape,
  timeOfDayShape,
  wallShape,
  zonedShape,
  zoneShape,
} from "../../../../src/prop/engine/shape/times.js";
import { WallShape, ZonedShape } from "../../../../src/prop/engine/shape/zoned.js";
import { ZONES } from "../../../../src/prop/engine/zone.js";
import { test as it } from "../../../../src/vitest.js";
import { thrown } from "../../../helpers.js";

/** A reader, which no builder of a date or a time reads. */
const READER = new Reader({ shape: "bool" }, new Map(), new Map());

/** Returns the id of the bounds of a generator that has them. */
function idOf(generator: unknown): string {
  return (generator as { readonly bounds: { readonly id: string } }).bounds.id;
}

describe("times", () => {
  describe("instantShape", () => {
    it("returns an instant between the bounds that it states in UTC", ({ seat }) => {
      const instant = instantShape(
        READER,
        { unit: "ms", min: "1970-01-01T00:00:01.5Z", max: "1970-01-02T00:00:00Z" },
        "shape",
      );

      check.isEqualTo(
        seat,
        [instant.per, instant.lo, instant.hi],
        [1_000n, [1n, 500n], [86_400n, 0n]],
        "the unit and the two bounds",
      );
    });

    it("refuses a bound without the zone Z", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() =>
          instantShape(READER, { unit: "s", min: "1970-01-01T00:00:00" }, "shape"),
        ),
        'prop: shape bound "1970-01-01T00:00:00" is no instant in UTC',
        "the refusal",
      );
    });
  });

  describe("dateShape", () => {
    it("returns the days between the stated dates", ({ seat }) => {
      check.isEqualTo(
        seat,
        idOf(dateShape(READER, { min: "1970-01-02", max: "1970-01-31" }, "shape")),
        "integer 1 30",
        "the days of January after the first",
      );
    });

    it("refuses a bound that is no date", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => dateShape(READER, { min: "1970-1-2" }, "shape")),
        'prop: shape bound "1970-1-2" is no date',
        "the refusal",
      );
    });
  });

  describe("timeOfDayShape", () => {
    it("returns the units since midnight between the stated times", ({ seat }) => {
      check.isEqualTo(
        seat,
        idOf(timeOfDayShape(READER, { unit: "ms", min: "00:00:01.25" }, "shape")),
        "integer 1250 86399999",
        "the milliseconds from 1.25 seconds",
      );
    });

    it("refuses a bound that is no time of day", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => timeOfDayShape(READER, { unit: "s", max: "noon" }, "shape")),
        'prop: shape bound "noon" is no time of day',
        "the refusal",
      );
    });
  });

  describe("localShape", () => {
    it("returns a local date and time between the stated bounds", ({ seat }) => {
      const local = localShape(
        READER,
        { unit: "s", min: "1970-01-02T00:00:00", max: "1970-01-03T12:00:00" },
        "shape",
      );

      check.isEqualTo(
        seat,
        [local instanceof LocalDateTimeShape, local.lo, local.hi],
        [true, [1n, 0n], [2n, 43_200n]],
        "the two bounds",
      );
    });

    it("refuses a bound with a zone", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() =>
          localShape(READER, { unit: "s", max: "1970-01-01T00:00:00Z" }, "shape"),
        ),
        'prop: shape bound "1970-01-01T00:00:00Z" is no local date and time',
        "the refusal",
      );
    });
  });

  describe("durationShape", () => {
    it("returns the units of a duration up to the largest that nanoseconds state", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        idOf(durationShape(READER, { unit: "s" }, "shape")),
        "integer -9223372036 9223372036",
        "the seconds of a signed 64-bit count of nanoseconds",
      );
    });
  });

  describe("offsetShape", () => {
    it("returns the seconds of an offset of up to 18 hours", ({ seat }) => {
      check.isEqualTo(
        seat,
        idOf(offsetShape(READER, {}, "shape")),
        "integer -64800 64800",
        "18 hours on each side of UTC",
      );
    });
  });

  describe("zoneShape", () => {
    it("returns the name of a zone of the list", ({ seat }) => {
      const zone = zoneShape() as SampledFrom<string>;

      check.isEqualTo(
        seat,
        zone.values,
        ZONES.map((one) => one.name),
        "the names of the zones",
      );
    });
  });

  describe("zonedShape", () => {
    it("returns an instant of the stated unit in a zone", ({ seat }) => {
      const zoned = zonedShape(READER, { unit: "ms" }, "shape") as ZonedShape;

      check.isEqualTo(
        seat,
        [
          zoned instanceof ZonedShape,
          zoned.instant instanceof InstantShape,
          zoned.instant.per,
        ],
        [true, true, 1_000n],
        "an instant at milliseconds",
      );
    });
  });

  describe("wallShape", () => {
    it("returns a local date and time of the stated unit in a zone", ({ seat }) => {
      const wall = wallShape(READER, { unit: "us" }, "shape") as WallShape;

      check.isEqualTo(
        seat,
        [wall instanceof WallShape, wall.local.per],
        [true, 1_000_000n],
        "a local date and time at microseconds",
      );
    });
  });
});
