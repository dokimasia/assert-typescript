// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The builders of the date and time shapes: instant, date, time-of-day,
 * local-date-time, duration, offset, zone, zoned-date-time and wall-time.
 * A bound of each states its value in the text form of ISO 8601.
 */

import { INT64_MAX } from "../choice.js";
import { type Generator, Integer, SampledFrom } from "../generator.js";
import * as literal from "../literal.js";
import { ZONES } from "../zone.js";
import {
  dayOf,
  FIRST_DAY,
  FIRST_SECOND,
  LAST_DAY,
  LAST_SECOND,
  SECONDS_PER_DAY,
  timeOf,
} from "./calendar.js";
import { ShapeError, shown } from "./error.js";
import { InstantShape, LocalDateTimeShape, type Pair } from "./pair.js";
import {
  bounded,
  fractionUnits,
  NANOSECONDS,
  type Node,
  pairBounds,
  unitOf,
} from "./parameters.js";
import type { Reader } from "./reader.js";
import { WallShape, ZonedShape } from "./zoned.js";

/** The largest duration, in nanoseconds, and the largest offset from UTC, in seconds. */
const MAX_DURATION_NS = INT64_MAX;
const MAX_OFFSET = 64_800n;

/** The text forms of a date, a time of day, and a date and time. */
const DATE = /^(\d{4})-(\d\d)-(\d\d)$/;
const TIME = /^(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?$/;
const DATE_TIME = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?(Z?)$/;

/** Returns the generator of an instant at the stated unit. */
export function instantShape(_reader: Reader, node: Node, where: string): InstantShape {
  const per = unitOf(node, where);
  const parse = (text: unknown): Pair => {
    const match = typeof text === "string" ? DATE_TIME.exec(text) : null;
    if (match === null || match[8] !== "Z") {
      throw new ShapeError(`prop: ${where} bound ${shown(text)} is no instant in UTC`);
    }
    const [, year, month, day, hour, minute, second, digits] =
      match as unknown as string[];
    const days = dayOf(year as string, month as string, day as string, where);
    const seconds =
      days * SECONDS_PER_DAY +
      timeOf(hour as string, minute as string, second as string, where);
    return [seconds, fractionUnits(digits, per, where)];
  };
  const [lo, hi] = pairBounds(
    node,
    where,
    [
      [FIRST_SECOND, 0n],
      [LAST_SECOND, per - 1n],
    ],
    parse,
  );
  return new InstantShape(per, lo, hi);
}

/** Returns the generator of a date, in days since 1970-01-01. */
export function dateShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const parse = (text: unknown): bigint => {
    const match = typeof text === "string" ? DATE.exec(text) : null;
    if (match === null) {
      throw new ShapeError(`prop: ${where} bound ${shown(text)} is no date`);
    }
    return dayOf(match[1] as string, match[2] as string, match[3] as string, where);
  };
  return new Integer(bounded(node, where, [FIRST_DAY, LAST_DAY], parse));
}

/** Returns the generator of a time of day, in units since midnight. */
export function timeOfDayShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const per = unitOf(node, where);
  const parse = (text: unknown): bigint => {
    const match = typeof text === "string" ? TIME.exec(text) : null;
    if (match === null) {
      throw new ShapeError(`prop: ${where} bound ${shown(text)} is no time of day`);
    }
    const seconds = timeOf(
      match[1] as string,
      match[2] as string,
      match[3] as string,
      where,
    );
    return seconds * per + fractionUnits(match[4], per, where);
  };
  return new Integer(bounded(node, where, [0n, SECONDS_PER_DAY * per - 1n], parse));
}

/** Returns the generator of a date and a time of day without a zone. */
export function localShape(
  _reader: Reader,
  node: Node,
  where: string,
): LocalDateTimeShape {
  const per = unitOf(node, where);
  const parse = (text: unknown): Pair => {
    const match = typeof text === "string" ? DATE_TIME.exec(text) : null;
    if (match === null || match[8] !== "") {
      throw new ShapeError(
        `prop: ${where} bound ${shown(text)} is no local date and time`,
      );
    }
    const [, year, month, day, hour, minute, second, digits] =
      match as unknown as string[];
    const days = dayOf(year as string, month as string, day as string, where);
    const seconds = timeOf(hour as string, minute as string, second as string, where);
    return [days, seconds * per + fractionUnits(digits, per, where)];
  };
  const fallback: readonly [Pair, Pair] = [
    [FIRST_DAY, 0n],
    [LAST_DAY, SECONDS_PER_DAY * per - 1n],
  ];
  const [lo, hi] = pairBounds(node, where, fallback, parse);
  return new LocalDateTimeShape(per, lo, hi);
}

/** Returns the generator of a duration, in units. */
export function durationShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const largest = MAX_DURATION_NS / (NANOSECONDS / unitOf(node, where));
  return new Integer(bounded(node, where, [-largest, largest], literal.integer));
}

/** Returns the generator of an offset from UTC, in seconds east of it. */
export function offsetShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  return new Integer(bounded(node, where, [-MAX_OFFSET, MAX_OFFSET], literal.integer));
}

/** Returns the generator of the name of a zone of the list. */
export function zoneShape(): Generator<unknown> {
  return new SampledFrom(ZONES.map((zone) => zone.name));
}

/** Returns the generator of an instant at the stated unit in a zone. */
export function zonedShape(
  reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  return new ZonedShape(instantShape(reader, { unit: node["unit"] }, where));
}

/** Returns the generator of a wall time at the stated unit in a zone. */
export function wallShape(
  reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  return new WallShape(localShape(reader, { unit: node["unit"] }, where));
}
