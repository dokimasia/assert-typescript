// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The inverses of the generators of a shape file: a root, a ref, a record,
 * an enum, a 128-bit integer, an instant, a local date-time, a zoned
 * date-time, a wall time and an IP address.
 */

import { IntegerBounds, UINT64_MAX } from "../choice.js";
import type { Bytes, Generator } from "../generator.js";
import {
  halves,
  InstantShape,
  Int128Shape,
  LocalDateTimeShape,
  secondPart,
} from "../shape/pair.js";
import { IpShape } from "../shape/scalars.js";
import { EnumShape, RecordShape, Ref, Root } from "../shape/structure.js";
import { WallShape, ZonedShape } from "../shape/zoned.js";
import { Fields, Variant } from "../value.js";
import { ZONES } from "../zone.js";
import { CannotInvert, shown } from "./refusal.js";
import { BIT, type Emitter, indexOf, type Step, step } from "./steps.js";

/** The bounds of the index of a zone of the list. */
const ZONE_INDEX = new IntegerBounds(0n, BigInt(ZONES.length - 1));

/** The choice of a zoned value whose zone has a change that takes the whole range. */
const WHOLE_RANGE = 0n;

/** The seconds of a day. */
const SECONDS_PER_DAY = 86_400n;

/** Returns the two fields of a record of a two-choice shape. */
function twoParts(
  value: unknown,
  names: readonly [string, string],
): readonly [unknown, unknown] {
  const fields = value instanceof Fields ? value.fields : undefined;
  if (
    fields?.length !== 2 ||
    fields[0]?.[0] !== names[0] ||
    fields[1]?.[0] !== names[1]
  ) {
    throw new CannotInvert(
      `prop: ${shown(value)} is no record of ${names.join(" and ")}`,
    );
  }
  return [
    (fields[0] as readonly [string, unknown])[1],
    (fields[1] as readonly [string, unknown])[1],
  ];
}

/** Returns the zone's index and the whole-range choice, and the other part. */
function zoneSteps(value: unknown, part: string): readonly [Step[], unknown] {
  const [inner, name] = twoParts(value, [part, "zone"]);
  const index = indexOf(
    ZONES.map((zone) => zone.name),
    name,
  );
  const steps: Step[] = [{ bounds: ZONE_INDEX, value: BigInt(index) }];
  if ((ZONES[index] as (typeof ZONES)[number]).changes.length > 0) {
    steps.push({ bounds: BIT, value: WHOLE_RANGE });
  }
  return [steps, inner];
}

/** The inverse of each generator of a shape file, by its class. */
export const SHAPES: readonly (readonly [unknown, Emitter])[] = [
  [Root, (g: Root, value, emit) => emit(g.node, value)],
  [
    Ref,
    (g: Ref, value, emit) =>
      emit(g.definitions.get(g.name) as Generator<unknown>, value),
  ],
  [
    RecordShape,
    (g: RecordShape, value, emit) => {
      const names = g.fields.map(([name]) => name);
      const stated = value instanceof Fields ? value.fields.map(([name]) => name) : [];
      if (
        stated.length !== names.length ||
        stated.some((name, i) => name !== names[i])
      ) {
        throw new CannotInvert(
          `prop: ${shown(value)} is no record of ${names.join(", ")}`,
        );
      }
      const steps: Step[] = [];
      const normal = g.fields.map(([name, of], i) => {
        const [fieldSteps, fieldNormal] = emit(
          of,
          ((value as Fields).fields[i] as readonly [string, unknown])[1],
        );
        steps.push(...fieldSteps);
        return [name, fieldNormal] as const;
      });
      return [steps, new Fields(normal)];
    },
  ],
  [
    EnumShape,
    (g: EnumShape, value, emit) => {
      const names = g.variants.map(([name]) => name);
      const index = value instanceof Variant ? names.indexOf(value.name) : -1;
      if (index < 0) {
        throw new CannotInvert(
          `prop: ${shown(value)} is no variant of ${names.join(", ")}`,
        );
      }
      const variant = value as Variant;
      const [, payload] = g.variants[index] as readonly [
        string,
        Generator<unknown> | undefined,
      ];
      const head: Step = {
        bounds: new IntegerBounds(0n, BigInt(names.length - 1)),
        value: BigInt(index),
      };
      if (payload === undefined) {
        if (variant.hasPayload) {
          throw new CannotInvert(`prop: the variant ${variant.name} has no payload`);
        }
        return [[head], value];
      }
      const [steps, normal] = emit(payload, variant.payload);
      return [[head, ...steps], new Variant(variant.name, normal)];
    },
  ],
  [
    Int128Shape,
    (g: Int128Shape, value) => {
      if (typeof value !== "bigint") {
        throw new CannotInvert(`prop: ${shown(value)} is no integer`);
      }
      const lo = halves(g.lo);
      const hi = halves(g.hi);
      const [high, low] = halves(value);
      const first = step(new IntegerBounds(lo[0], hi[0]), high);
      return [[first, step(secondPart(high, lo, hi, UINT64_MAX), low)], value];
    },
  ],
  [
    InstantShape,
    (g: InstantShape, value) => {
      const [seconds, units] = twoParts(value, ["seconds", "units"]);
      const steps = [step(new IntegerBounds(g.lo[0], g.hi[0]), seconds)];
      if (g.per === 1n) {
        if (units !== 0n) {
          throw new CannotInvert(
            `prop: an instant at seconds has no units, not ${shown(units)}`,
          );
        }
        return [steps, value];
      }
      return [
        [...steps, step(secondPart(seconds as bigint, g.lo, g.hi, g.per - 1n), units)],
        value,
      ];
    },
  ],
  [
    LocalDateTimeShape,
    (g: LocalDateTimeShape, value) => {
      const [day, time] = twoParts(value, ["date", "time-of-day"]);
      const first = step(new IntegerBounds(g.lo[0], g.hi[0]), day);
      const top = SECONDS_PER_DAY * g.per - 1n;
      return [[first, step(secondPart(day as bigint, g.lo, g.hi, top), time)], value];
    },
  ],
  [
    ZonedShape,
    (g: ZonedShape, value, emit) => {
      const [steps, instant] = zoneSteps(value, "instant");
      return [[...steps, ...emit(g.instant, instant)[0]], value];
    },
  ],
  [
    WallShape,
    (g: WallShape, value, emit) => {
      const [steps, local] = zoneSteps(value, "local-date-time");
      return [[...steps, ...emit(g.local, local)[0]], value];
    },
  ],
  [
    IpShape,
    (g: IpShape, value, emit) => {
      if (!(value instanceof Uint8Array)) {
        throw new CannotInvert(`prop: ${shown(value)} is no address`);
      }
      const index = g.versions.findIndex(
        (version) => version.bounds.minSize === value.length,
      );
      if (index < 0) {
        throw new CannotInvert(`prop: ${shown(value)} is neither 4 nor 16 bytes`);
      }
      const [steps] = emit(g.versions[index] as Bytes, value);
      return [[{ bounds: BIT, value: BigInt(index) }, ...steps], value];
    },
  ],
];
