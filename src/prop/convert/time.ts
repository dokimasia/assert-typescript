// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The converters of the time shapes: instant, date, time-of-day,
 * local-date-time, duration, zoned-date-time and wall-time. Each converts
 * the engine's value to a Temporal value at the unit of its shape.
 */

import { Fields } from "../engine/value.js";
import { type Converter, refuse } from "./converter.js";

/** The nanoseconds of a second, of a day, and of each unit of a duration from the hours down. */
const SECOND = 1_000_000_000n;
const SECONDS_PER_DAY = 86_400n;
const NANOSECONDS = {
  hours: 3_600_000_000_000n,
  minutes: 60_000_000_000n,
  seconds: 1_000_000_000n,
  milliseconds: 1_000_000n,
  microseconds: 1_000n,
  nanoseconds: 1n,
} as const;

/** The milliseconds of a second, the microseconds of a millisecond and the nanoseconds of a microsecond. */
const SUBUNITS = 1000;

/** The first day of the days that a date counts. */
const EPOCH = Temporal.PlainDate.from("1970-01-01");

/** Returns the floor of a / b and the remainder of that division, for b > 0. */
function divmod(a: bigint, b: bigint): readonly [bigint, bigint] {
  const remainder = ((a % b) + b) % b;
  return [(a - remainder) / b, remainder];
}

/** Returns the whole units of nanoseconds, and throws for nanoseconds finer than the unit. */
function whole(nanoseconds: bigint, unit: bigint, value: unknown): bigint {
  if (nanoseconds % unit !== 0n) {
    throw new RangeError(
      `prop: ${String(value)} is finer than the shape's unit of ${unit} ns`,
    );
  }
  return nanoseconds / unit;
}

/** Returns the two parts of the value of a time shape of two parts. */
function partsOf(value: unknown): readonly [unknown, unknown] {
  const { fields } = value as Fields;
  return [
    (fields[0] as readonly [string, unknown])[1],
    (fields[1] as readonly [string, unknown])[1],
  ];
}

/** Returns the value of a time shape of two named parts. */
function twoParts(first: string, a: unknown, second: string, b: unknown): Fields {
  return new Fields([
    [first, a],
    [second, b],
  ]);
}

/** Returns the days since 1970-01-01 of a date. */
function daysOf(date: Temporal.PlainDate): bigint {
  return BigInt(EPOCH.until(date, { largestUnit: "days" }).days);
}

/** Returns the nanoseconds since midnight of a time of day. */
function sinceMidnight(time: Temporal.PlainTime): bigint {
  const seconds = (time.hour * 60 + time.minute) * 60 + time.second;
  const fraction =
    (time.millisecond * SUBUNITS + time.microsecond) * SUBUNITS + time.nanosecond;
  return BigInt(seconds) * SECOND + BigInt(fraction);
}

/** Returns the time of day of nanoseconds since midnight. */
function timeAt(nanoseconds: bigint): Temporal.PlainTime {
  return Temporal.PlainTime.from("00:00").add(durationOf(nanoseconds));
}

/** The units of a time shape, as the nanoseconds of one unit. */
export const UNIT_NANOSECONDS: ReadonlyMap<unknown, bigint> = new Map([
  ["s", NANOSECONDS.seconds],
  ["ms", NANOSECONDS.milliseconds],
  ["us", NANOSECONDS.microseconds],
  ["ns", NANOSECONDS.nanoseconds],
]);

/**
 * Returns the nanoseconds of a duration of time, with days of 24 hours.
 *
 * @param duration - The duration.
 * @returns The nanoseconds.
 * @throws RangeError for a duration with years, months or weeks.
 */
export function nanosecondsOf(duration: Temporal.Duration): bigint {
  if (duration.years !== 0 || duration.months !== 0 || duration.weeks !== 0) {
    throw new RangeError(
      `prop: ${duration} states a calendar unit, which has no fixed length`,
    );
  }
  let total = BigInt(duration.days) * SECONDS_PER_DAY * SECOND;
  for (const [unit, size] of Object.entries(NANOSECONDS)) {
    total += BigInt(duration[unit as keyof typeof NANOSECONDS]) * size;
  }
  return total;
}

/**
 * Returns the duration of a number of nanoseconds, balanced from the hours
 * down.
 *
 * @param nanoseconds - The nanoseconds.
 * @returns The duration.
 */
export function durationOf(nanoseconds: bigint): Temporal.Duration {
  const fields: Record<string, number> = {};
  let rest = nanoseconds;
  for (const [unit, size] of Object.entries(NANOSECONDS)) {
    fields[unit] = Number(rest / size);
    rest %= size;
  }
  return Temporal.Duration.from(fields);
}

/** Returns the converter of an instant at a unit of unit nanoseconds. */
export function instantOf(unit: bigint): Converter {
  return {
    to: (value) => {
      const [seconds, units] = partsOf(value) as [bigint, bigint];
      return Temporal.Instant.fromEpochNanoseconds(seconds * SECOND + units * unit);
    },
    back: (value) => {
      if (value instanceof Fields) {
        return value;
      }
      if (!(value instanceof Temporal.Instant)) {
        refuse(value, "instant");
      }
      const [seconds, nanoseconds] = divmod(value.epochNanoseconds, SECOND);
      return twoParts("seconds", seconds, "units", whole(nanoseconds, unit, value));
    },
  };
}

/** The converter of a date. */
export const DATE: Converter = {
  to: (value) => EPOCH.add({ days: Number(value) }),
  back: (value) => {
    if (typeof value === "bigint") {
      return value;
    }
    if (!(value instanceof Temporal.PlainDate)) {
      refuse(value, "date");
    }
    return daysOf(value);
  },
};

/** Returns the converter of a time of day at a unit of unit nanoseconds. */
export function timeOfDayOf(unit: bigint): Converter {
  return {
    to: (value) => timeAt((value as bigint) * unit),
    back: (value) => {
      if (typeof value === "bigint") {
        return value;
      }
      if (!(value instanceof Temporal.PlainTime)) {
        refuse(value, "time-of-day");
      }
      return whole(sinceMidnight(value), unit, value);
    },
  };
}

/** Returns the converter of a local date and time at a unit of unit nanoseconds. */
export function localOf(unit: bigint): Converter {
  return {
    to: (value) => {
      const [days, units] = partsOf(value) as [bigint, bigint];
      return (DATE.to(days) as Temporal.PlainDate).toPlainDateTime(
        timeAt(units * unit),
      );
    },
    back: (value) => {
      if (value instanceof Fields) {
        return value;
      }
      if (!(value instanceof Temporal.PlainDateTime)) {
        refuse(value, "local-date-time");
      }
      const units = whole(sinceMidnight(value.toPlainTime()), unit, value);
      return twoParts("date", daysOf(value.toPlainDate()), "time-of-day", units);
    },
  };
}

/** Returns the converter of a duration at a unit of unit nanoseconds. */
export function durationShapeOf(unit: bigint): Converter {
  return {
    to: (value) => durationOf((value as bigint) * unit),
    back: (value) => {
      if (typeof value === "bigint") {
        return value;
      }
      if (!(value instanceof Temporal.Duration)) {
        refuse(value, "duration");
      }
      return whole(nanosecondsOf(value), unit, value);
    },
  };
}

/** Returns the converter of an instant in a zone at a unit of unit nanoseconds. */
export function zonedOf(unit: bigint): Converter {
  const instant = instantOf(unit);
  return {
    to: (value) => {
      const [at, zone] = partsOf(value);
      return (instant.to(at) as Temporal.Instant).toZonedDateTimeISO(zone as string);
    },
    back: (value) => {
      if (value instanceof Fields) {
        return value;
      }
      if (!(value instanceof Temporal.ZonedDateTime)) {
        refuse(value, "zoned-date-time");
      }
      return twoParts(
        "instant",
        instant.back(value.toInstant()),
        "zone",
        value.timeZoneId,
      );
    },
  };
}

/** Returns the converter of a wall time in a zone at a unit of unit nanoseconds. */
export function wallOf(unit: bigint): Converter {
  const local = localOf(unit);
  return {
    to: (value) => {
      const [at, zone] = partsOf(value);
      return { local: local.to(at), zone };
    },
    back: (value) => {
      if (value instanceof Fields) {
        return value;
      }
      const { local: at, zone } = (value ?? {}) as { local?: unknown; zone?: unknown };
      if (!(at instanceof Temporal.PlainDateTime) || typeof zone !== "string") {
        refuse(value, "wall-time");
      }
      return twoParts("local-date-time", local.back(at), "zone", zone);
    },
  };
}
