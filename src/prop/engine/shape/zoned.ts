// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The shapes of a zone: an instant in a zone, and a wall time in a zone.
 * Each draws its zone first, and then a value near one of the zone's
 * changes or a value of its unzoned shape.
 */

import { type Case, DECODE } from "../case.js";
import { IntegerBounds } from "../choice.js";
import * as draw from "../draw.js";
import { Generator } from "../generator.js";
import { Fields } from "../value.js";
import { ZONES, type Zone } from "../zone.js";
import { divmod, SECONDS_PER_DAY } from "./calendar.js";
import {
  type InstantShape,
  instantValue,
  type LocalDateTimeShape,
  localValue,
} from "./pair.js";

/** The odds that a zoned value comes from its zone's changes, and that a wall time near one takes the offset after it. */
const NEAR_CHANGE: draw.Rational = { num: 1n, den: 4n };
const AFTER_CHANGE: draw.Rational = { num: 1n, den: 2n };

/** Returns whether a value of a zone comes from one of its changes. A zone without a change makes no choice. */
function near(c: Case, zone: Zone): boolean {
  if (zone.changes.length === 0) {
    return false;
  }
  const bounds = new IntegerBounds(0n, 1n);
  return (
    c.choose({ bounds, draw: (source) => draw.boolean(source, NEAR_CHANGE) }) === 1n
  );
}

/** Returns the index of one of a zone's changes, and a step from −1 to 1. */
function changeAndStep(c: Case, zone: Zone): readonly [number, bigint] {
  const index = c.integer(new IntegerBounds(0n, BigInt(zone.changes.length - 1)), 0n);
  return [Number(index), c.integer(new IntegerBounds(-1n, 1n), undefined, true)];
}

/** The bounds of the index of a zone of the list. */
const ZONE_INDEX = new IntegerBounds(0n, BigInt(ZONES.length - 1));

/** Returns the zone of the list that an index chooses. */
function zoneOf(c: Case): Zone {
  return ZONES[Number(c.integer(ZONE_INDEX, 0n))] as Zone;
}

/** An instant in a zone: the zone, then an instant near one of its changes or not. */
export class ZonedShape extends Generator<Fields> {
  /** The instant's shape. */
  readonly instant: InstantShape;

  constructor(instant: InstantShape) {
    super();
    this.instant = instant;
  }

  /** Returns the record of the instant and the zone's name. */
  [DECODE](c: Case): Fields {
    const { per } = this.instant;
    return c.span("zoned-date-time", () => {
      const zone = zoneOf(c);
      let value: Fields;
      if (near(c, zone)) {
        const [index, step] = changeAndStep(c, zone);
        const change = zone.changes[index] as Zone["changes"][number];
        value = instantValue(...divmod(change.at * per + step, per));
      } else {
        value = this.instant[DECODE](c);
      }
      return new Fields([
        ["instant", value],
        ["zone", zone.name],
      ]);
    });
  }
}

/**
 * A wall time in a zone, which the code under test resolves. The zone comes
 * first. A wall time near a change is the change's instant in the offset
 * before it or after it, moved by a step of one unit. These wall times
 * include the ones that a gap skips and the ones that a fold repeats.
 */
export class WallShape extends Generator<Fields> {
  /** The local date and time's shape. */
  readonly local: LocalDateTimeShape;

  constructor(local: LocalDateTimeShape) {
    super();
    this.local = local;
  }

  /** Returns the record of the local date and time and the zone's name. */
  [DECODE](c: Case): Fields {
    const { per } = this.local;
    return c.span("wall-time", () => {
      const zone = zoneOf(c);
      let value: Fields;
      if (near(c, zone)) {
        const [index, step] = changeAndStep(c, zone);
        const change = zone.changes[index] as Zone["changes"][number];
        const bounds = new IntegerBounds(0n, 1n);
        const after = c.choose({
          bounds,
          draw: (source) => draw.boolean(source, AFTER_CHANGE),
        });
        const offset = after === 1n ? change.after : change.before;
        const total = (change.at + offset) * per + step;
        value = localValue(...divmod(total, SECONDS_PER_DAY * per));
      } else {
        value = this.local[DECODE](c);
      }
      return new Fields([
        ["local-date-time", value],
        ["zone", zone.name],
      ]);
    });
  }
}
