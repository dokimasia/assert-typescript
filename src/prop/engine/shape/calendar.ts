// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The calendar of the date and time shapes: days since 1970-01-01 of the
 * proleptic Gregorian calendar, seconds since midnight, and the bounds of
 * the years 1 to 9999.
 */

import { ShapeError } from "./error.js";

/** The last year of the date and time shapes by default. */
const LAST_YEAR = 9999;

/** The milliseconds in a day. */
const MILLISECONDS_PER_DAY = 86_400_000;

/** The bounds of the date and time shapes by default: years 1 to 9999, in seconds and in days. */
export const SECONDS_PER_DAY = 86_400n;
export const FIRST_SECOND = -62_135_596_800n;
export const LAST_SECOND = 253_402_300_799n;
export const FIRST_DAY = floorDiv(FIRST_SECOND, SECONDS_PER_DAY);
export const LAST_DAY = floorDiv(LAST_SECOND, SECONDS_PER_DAY);

/** Returns the floor of a / b, for b > 0. */
export function floorDiv(a: bigint, b: bigint): bigint {
  const quotient = a / b;
  return a < 0n && quotient * b !== a ? quotient - 1n : quotient;
}

/** Returns the floor of a / b and the remainder of that division, for b > 0. */
export function divmod(a: bigint, b: bigint): readonly [bigint, bigint] {
  const quotient = floorDiv(a, b);
  return [quotient, a - quotient * b];
}

/**
 * Returns the days since 1970-01-01 of a date of the proleptic Gregorian
 * calendar, which a time value of ECMAScript counts in. A date that Date
 * moves to another day, such as February 30, is no date.
 */
export function dayOf(year: string, month: string, day: string, where: string): bigint {
  const y = Number(year);
  const m = Number(month) - 1;
  const d = Number(day);
  const date = new Date(0);
  date.setUTCFullYear(y, m, d);
  const valid =
    y >= 1 &&
    y <= LAST_YEAR &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m &&
    date.getUTCDate() === d;
  if (!valid) {
    throw new ShapeError(
      `prop: ${where} states ${year}-${month}-${day}, which is no date`,
    );
  }
  return BigInt(date.getTime() / MILLISECONDS_PER_DAY);
}

/** Returns the seconds since midnight of a time of day. */
export function timeOf(
  hour: string,
  minute: string,
  second: string,
  where: string,
): bigint {
  const h = Number(hour);
  const m = Number(minute);
  const s = Number(second);
  if (h >= 24 || m >= 60 || s >= 60) {
    throw new ShapeError(
      `prop: ${where} states ${hour}:${minute}:${second}, which is no time`,
    );
  }
  return BigInt((h * 60 + m) * 60 + s);
}
