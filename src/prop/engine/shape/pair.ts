// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The shapes of two choices: a 128-bit integer, an instant and a local date
 * and time. The second choice ranges over its whole range, except where the
 * first choice equals the first part of a bound.
 */

import { type Case, DECODE } from "../case.js";
import { IntegerBounds, UINT64_MAX } from "../choice.js";
import { Generator } from "../generator.js";
import { Fields } from "../value.js";
import { SECONDS_PER_DAY } from "./calendar.js";

/** The bits of a half of a 128-bit integer. */
const HALF = 64n;

/** A bound of a two-choice shape: a first and a second part. */
export type Pair = readonly [first: bigint, second: bigint];

/**
 * Returns the bounds of the second choice of a two-choice shape. It ranges
 * over [0, top], except where the first choice equals a bound's first part,
 * where it stops at that bound's second part.
 *
 * @param first - The first choice.
 * @param lo - The lower bound.
 * @param hi - The upper bound.
 * @param top - The largest second part.
 * @returns The bounds.
 */
export function secondPart(
  first: bigint,
  lo: Pair,
  hi: Pair,
  top: bigint,
): IntegerBounds {
  return new IntegerBounds(first === lo[0] ? lo[1] : 0n, first === hi[0] ? hi[1] : top);
}

/** Returns the high and the low 64 bits of a 128-bit integer. */
export function halves(value: bigint): Pair {
  return [value >> HALF, value & UINT64_MAX];
}

/**
 * A 128-bit integer: its high 64 bits, then its low 64 bits, as one span.
 * The high half is signed when the shape is. The low half ranges over the
 * unsigned 64-bit range, except where the high half equals the high half of
 * a bound, where it stops at that bound's low half.
 */
export class Int128Shape extends Generator<bigint> {
  /** The smallest value. */
  readonly lo: bigint;
  /** The largest value. */
  readonly hi: bigint;

  constructor(lo: bigint, hi: bigint) {
    super();
    this.lo = lo;
    this.hi = hi;
  }

  /** Returns the integer that the two halves state. */
  [DECODE](c: Case): bigint {
    const lo = halves(this.lo);
    const hi = halves(this.hi);
    const [high, low] = c.span("int", () => {
      const first = c.integer(new IntegerBounds(lo[0], hi[0]), undefined, true);
      const second = c.integer(secondPart(first, lo, hi, UINT64_MAX), undefined, true);
      return [first, second] as const;
    });
    return (high << HALF) | low;
  }
}

/** Returns the value of an instant: its seconds and its units within the second. */
export function instantValue(seconds: bigint, units: bigint): Fields {
  return new Fields([
    ["seconds", seconds],
    ["units", units],
  ]);
}

/** Returns the value of a local-date-time: its date and its time of day. */
export function localValue(day: bigint, time: bigint): Fields {
  return new Fields([
    ["date", day],
    ["time-of-day", time],
  ]);
}

/** An instant: its seconds, then the units within the second, as one span. A unit of a second makes no second choice. */
export class InstantShape extends Generator<Fields> {
  /** The units in a second. */
  readonly per: bigint;
  /** The lower bound: its seconds and its units. */
  readonly lo: Pair;
  /** The upper bound: its seconds and its units. */
  readonly hi: Pair;

  constructor(per: bigint, lo: Pair, hi: Pair) {
    super();
    this.per = per;
    this.lo = lo;
    this.hi = hi;
  }

  /** Returns the record of the seconds and the units. */
  [DECODE](c: Case): Fields {
    const [seconds, units] = c.span("instant", () => {
      const first = c.integer(
        new IntegerBounds(this.lo[0], this.hi[0]),
        undefined,
        true,
      );
      if (this.per === 1n) {
        return [first, 0n] as const;
      }
      const bounds = secondPart(first, this.lo, this.hi, this.per - 1n);
      return [first, c.integer(bounds, undefined, true)] as const;
    });
    return instantValue(seconds, units);
  }
}

/** A date and a time of day without a zone, as one span. */
export class LocalDateTimeShape extends Generator<Fields> {
  /** The units in a second. */
  readonly per: bigint;
  /** The lower bound: its day and its time of day. */
  readonly lo: Pair;
  /** The upper bound: its day and its time of day. */
  readonly hi: Pair;

  constructor(per: bigint, lo: Pair, hi: Pair) {
    super();
    this.per = per;
    this.lo = lo;
    this.hi = hi;
  }

  /** Returns the record of the date and the time of day. */
  [DECODE](c: Case): Fields {
    const [day, time] = c.span("local-date-time", () => {
      const first = c.integer(
        new IntegerBounds(this.lo[0], this.hi[0]),
        undefined,
        true,
      );
      const top = SECONDS_PER_DAY * this.per - 1n;
      return [
        first,
        c.integer(secondPart(first, this.lo, this.hi, top), undefined, true),
      ] as const;
    });
    return localValue(day, time);
  }
}
