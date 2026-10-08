/**
 * Shapes: a language-neutral description of a type's values, read into a
 * generator.
 *
 * A shape is a JSON object whose `shape` key names its id. A shape file is a
 * root shape that may also state `definitions`, the shapes that a `ref`
 * names, and `source`, the language and the type it was read from, which no
 * reader compares. read turns a shape file into a generator of the engine.
 * Two implementations that read one shape decode the same value from the
 * same choices.
 *
 * Structural shapes decode as the generators do: bool as boolean, an int up
 * to 64 bits wide as integer, float, char and string as string, bytes, list,
 * fixed-list and set as list, map as dict, optional, and literal as
 * sampled-from. A record decodes its fields in order, an enum an index and
 * then the chosen variant's payload, and a ref the definition it names.
 *
 * Domain shapes decode to the form in which the definition states their
 * values:
 *
 * - uuid and ip-address: bytes in network order.
 * - decimal: the unscaled integer.
 * - date: days since 1970-01-01. time-of-day: units since midnight.
 *   duration: units. offset: seconds east of UTC. zone: its name.
 * - instant: a record of its seconds since 1970-01-01T00:00:00Z and the
 *   units within the second.
 * - local-date-time: a record of its date and its time of day.
 * - zoned-date-time: a record of its instant and its zone.
 * - wall-time: a record of its local-date-time and its zone.
 *
 * A key that a shape does not take fails the read, and the failure names
 * where the key is. A value of a recursive shape has a budget of 100 nodes,
 * where a node is the value of a definition that can refer to itself through
 * refs. Once a value has used its budget, every container that refers back
 * takes its exit: an optional is absent, a list, a set or a map takes no
 * further element, and an enum takes its first variant that does not refer
 * back. A definition that can refer to itself without passing through such
 * a container has no finite value, and fails the read.
 */

import * as alphabet from "./alphabet.js";
import { type Case, DECODE } from "./case.js";
import {
  FloatBounds,
  INT64_MAX,
  INT64_MIN,
  IntegerBounds,
  SequenceBounds,
  UINT64_MAX,
} from "./choice.js";
import { collect, ELEMENT, ENTRY, Sizes } from "./collection.js";
import * as draw from "./draw.js";
import type { Width } from "./float.js";
import {
  Bool,
  Bytes,
  Float,
  Generator,
  Integer,
  Matching,
  SampledFrom,
  Text,
} from "./generator.js";
import * as literal from "./literal.js";
import { piece } from "./pattern.js";
import { canonical, Fields, Pairs, Variant } from "./value.js";
import { ZONES, type Zone } from "./zone.js";

/** The nodes that one value of a recursive shape may use. */
const BUDGET = 100;

/** The units of a time shape, by name, as the count of them in a second. */
const UNITS: ReadonlyMap<string, bigint> = new Map([
  ["s", 1n],
  ["ms", 1_000n],
  ["us", 1_000_000n],
  ["ns", 1_000_000_000n],
]);

/** The bounds of the date and time shapes by default: years 1 to 9999, in seconds and in days. */
const SECONDS_PER_DAY = 86_400n;
const FIRST_SECOND = -62_135_596_800n;
const LAST_SECOND = 253_402_300_799n;
const FIRST_DAY = floorDiv(FIRST_SECOND, SECONDS_PER_DAY);
const LAST_DAY = floorDiv(LAST_SECOND, SECONDS_PER_DAY);

/** The largest duration, in nanoseconds, and the largest offset from UTC, in seconds. */
const MAX_DURATION_NS = INT64_MAX;
const MAX_OFFSET = 64_800n;

/** The odds that a zoned value comes from its zone's changes, and that a wall time near one takes the offset after it. */
const NEAR_CHANGE: draw.Rational = { num: 1n, den: 4n };
const AFTER_CHANGE: draw.Rational = { num: 1n, den: 2n };

/** The widths of the int shape, and the half of a 128-bit integer. */
const INT_WIDTHS = new Set([8, 16, 32, 64, 128]);
const HALF = 64n;

/** The bytes of an address of each IP version, and of a UUID. */
const ADDRESS_BYTES: ReadonlyMap<unknown, number> = new Map([
  [4, 4],
  [6, 16],
]);
const UUID_BYTES = 16;

/** The largest finite float of each width. */
const FLOAT_MAX: Readonly<Record<Width, number>> = {
  32: 3.4028234663852886e38,
  64: Number.MAX_VALUE,
};

/** What each shape takes besides `shape`: its required keys, then the keys that it may state. */
const KEYS: ReadonlyMap<string, readonly [readonly string[], readonly string[]]> =
  new Map([
    ["bool", [[], []]],
    [
      "int",
      [
        ["width", "signed"],
        ["min", "max"],
      ],
    ],
    ["float", [["width"], ["min", "max", "allow_nan", "allow_infinity"]]],
    ["char", [[], ["alphabet"]]],
    ["string", [[], ["min_size", "max_size", "alphabet", "pattern"]]],
    ["bytes", [[], ["min_size", "max_size"]]],
    ["list", [["of"], ["min_size", "max_size"]]],
    ["fixed-list", [["of", "size"], []]],
    ["set", [["of"], ["min_size", "max_size"]]],
    [
      "map",
      [
        ["key", "of"],
        ["min_size", "max_size"],
      ],
    ],
    ["optional", [["of"], []]],
    ["record", [["fields"], []]],
    ["enum", [["variants"], []]],
    ["literal", [["values"], []]],
    ["ref", [["name"], []]],
    ["uuid", [[], []]],
    ["ip-address", [[], ["version"]]],
    ["decimal", [["scale"], ["min", "max"]]],
    ["instant", [["unit"], ["min", "max"]]],
    ["date", [[], ["min", "max"]]],
    ["time-of-day", [["unit"], ["min", "max"]]],
    ["local-date-time", [["unit"], ["min", "max"]]],
    ["duration", [["unit"], ["min", "max"]]],
    ["offset", [[], ["min", "max"]]],
    ["zone", [[], []]],
    ["zoned-date-time", [["unit"], []]],
    ["wall-time", [["unit"], []]],
  ]);

/** The keys that only a shape file's root states. */
const ROOT_KEYS = new Set(["definitions", "source"]);

/** The text forms of a date, a time of day, a date and time, and a decimal bound. */
const DATE = /^(\d{4})-(\d\d)-(\d\d)$/;
const TIME = /^(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?$/;
const DATE_TIME = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?(Z?)$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

/** A shape as its JSON states it. */
type Node = Readonly<Record<string, unknown>>;

/** A bound of a two-choice shape: a first and a second part. */
type Pair = readonly [first: bigint, second: bigint];

/** A shape that does not read: unknown, misstated, or without a finite value. */
export class ShapeError extends Error {
  /**
   * Returns the error of a shape that does not read.
   *
   * @param message - Where the shape is wrong and why.
   */
  constructor(message: string) {
    super(message);
    this.name = "ShapeError";
  }
}

/** Returns the JSON text of a value, for an error's message. */
function shown(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** Returns the floor of a / b, for b > 0. */
function floorDiv(a: bigint, b: bigint): bigint {
  const quotient = a / b;
  return a < 0n && quotient * b !== a ? quotient - 1n : quotient;
}

/** Returns the floor of a / b and the remainder of that division, for b > 0. */
function divmod(a: bigint, b: bigint): readonly [bigint, bigint] {
  const quotient = floorDiv(a, b);
  return [quotient, a - quotient * b];
}

/** Compares two pairs as Python compares tuples. */
function comparePairs(a: Pair, b: Pair): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

/** The nodes that each value in progress of one shape file has used. */
class Budget {
  readonly #used: number[] = [];

  /** Returns what fn returns, with the nodes of one value counted from zero while it decodes. */
  value<T>(fn: () => T): T {
    this.#used.push(0);
    try {
      return fn();
    } finally {
      this.#used.pop();
    }
  }

  /** Counts one node of the value in progress. */
  spend(): void {
    this.#used.push((this.#used.pop() as number) + 1);
  }

  /** Whether the value in progress has used its budget. */
  get exhausted(): boolean {
    return this.#used.length > 0 && (this.#used.at(-1) as number) >= BUDGET;
  }
}

/** A recursive shape's root: it counts the budget of each value from zero. */
export class Root extends Generator<unknown> {
  /** The root shape's generator. */
  readonly node: Generator<unknown>;
  readonly #budget: Budget;

  constructor(node: Generator<unknown>, budget: Budget) {
    super();
    this.node = node;
    this.#budget = budget;
  }

  /** Returns one value of the root shape. */
  [DECODE](c: Case): unknown {
    return this.#budget.value(() => this.node[DECODE](c));
  }
}

/** The value of a definition, by name. A cyclic one counts one node. */
export class Ref extends Generator<unknown> {
  /** The definition's name. */
  readonly name: string;
  /** The generators of the definitions. */
  readonly definitions: ReadonlyMap<string, Generator<unknown>>;
  readonly #cyclic: boolean;
  readonly #budget: Budget;

  constructor(
    name: string,
    definitions: ReadonlyMap<string, Generator<unknown>>,
    cyclic: boolean,
    budget: Budget,
  ) {
    super();
    this.name = name;
    this.definitions = definitions;
    this.#cyclic = cyclic;
    this.#budget = budget;
  }

  /** Returns the value of the named definition. */
  [DECODE](c: Case): unknown {
    if (this.#cyclic) this.#budget.spend();
    return (this.definitions.get(this.name) as Generator<unknown>)[DECODE](c);
  }
}

/** A value or undefined: a presence choice, which is forced absent at an exit. */
export class OptionalShape extends Generator<unknown> {
  /** The generator of the value. */
  readonly of: Generator<unknown>;
  readonly #exits: boolean;
  readonly #budget: Budget;

  constructor(of: Generator<unknown>, exits: boolean, budget: Budget) {
    super();
    this.of = of;
    this.#exits = exits;
    this.#budget = budget;
  }

  /** Returns undefined when absent, and the decoded value when present. */
  [DECODE](c: Case): unknown {
    const forced = this.#exits && this.#budget.exhausted;
    const bounds = new IntegerBounds(0n, forced ? 0n : 1n);
    return c.span("optional", () =>
      c.integer(bounds, 1n) === 1n ? this.of[DECODE](c) : undefined,
    );
  }
}

/** A list, a fixed-list or a set: elements as a collection, empty at an exit. A set's elements are unique. */
export class ListShape extends Generator<unknown[]> {
  /** The generator of the elements. */
  readonly of: Generator<unknown>;
  /** The sizes. */
  readonly sizes: Sizes;
  /** Whether the elements are unique, as a set's are. */
  readonly unique: boolean;
  readonly #exits: boolean;
  readonly #budget: Budget;

  constructor(
    of: Generator<unknown>,
    sizes: Sizes,
    unique: boolean,
    exits: boolean,
    budget: Budget,
  ) {
    super();
    this.of = of;
    this.sizes = sizes;
    this.unique = unique;
    this.#exits = exits;
    this.#budget = budget;
  }

  /** Returns the elements that the case's flags and choices decode to. */
  [DECODE](c: Case): unknown[] {
    const stop = this.#exits ? () => this.#budget.exhausted : undefined;
    return c.span("list", () =>
      collect(
        c,
        this.sizes,
        ELEMENT,
        () => {
          const value = this.of[DECODE](c);
          return [value, this.unique ? canonical(value) : undefined] as const;
        },
        stop,
      ),
    );
  }
}

/** A map: entries with distinct keys, as a dict decodes them, empty at an exit. */
export class MapShape extends Generator<Pairs> {
  /** The generator of the keys. */
  readonly key: Generator<unknown>;
  /** The generator of the values. */
  readonly of: Generator<unknown>;
  /** The sizes. */
  readonly sizes: Sizes;
  readonly #exits: boolean;
  readonly #budget: Budget;

  constructor(
    key: Generator<unknown>,
    of: Generator<unknown>,
    sizes: Sizes,
    exits: boolean,
    budget: Budget,
  ) {
    super();
    this.key = key;
    this.of = of;
    this.sizes = sizes;
    this.#exits = exits;
    this.#budget = budget;
  }

  /** Returns the entries that the case's flags, keys and values decode to. */
  [DECODE](c: Case): Pairs {
    const stop = this.#exits ? () => this.#budget.exhausted : undefined;
    return c.span("dict", () => {
      const entries = collect(
        c,
        this.sizes,
        ENTRY,
        () => {
          const key = this.key[DECODE](c);
          return [[key, this.of[DECODE](c)] as const, canonical(key)] as const;
        },
        stop,
      );
      return new Pairs(entries);
    });
  }
}

/** Named fields, each decoded in declaration order, as one span. */
export class RecordShape extends Generator<Fields> {
  /** The fields, each a name and a generator. */
  readonly fields: readonly (readonly [string, Generator<unknown>])[];

  constructor(fields: readonly (readonly [string, Generator<unknown>])[]) {
    super();
    this.fields = fields;
  }

  /** Returns the record of each field's value. */
  [DECODE](c: Case): Fields {
    return c.span(
      "record",
      () => new Fields(this.fields.map(([name, of]) => [name, of[DECODE](c)] as const)),
    );
  }
}

/**
 * A variant: an index that decides structure, then its payload when it has
 * one. exit is the index of the first variant that does not refer back,
 * which the index takes once the budget is used, and undefined when the enum
 * does not refer back.
 */
export class EnumShape extends Generator<Variant> {
  /** The variants, each a name and the generator of its payload, or undefined. */
  readonly variants: readonly (readonly [string, Generator<unknown> | undefined])[];
  readonly #exit: number | undefined;
  readonly #budget: Budget;

  constructor(
    variants: readonly (readonly [string, Generator<unknown> | undefined])[],
    exit: number | undefined,
    budget: Budget,
  ) {
    super();
    this.variants = variants;
    this.#exit = exit;
    this.#budget = budget;
  }

  /** Returns the variant that the case chooses. */
  [DECODE](c: Case): Variant {
    let bounds = new IntegerBounds(0n, BigInt(this.variants.length - 1));
    if (this.#exit !== undefined && this.#budget.exhausted) {
      bounds = new IntegerBounds(BigInt(this.#exit), BigInt(this.#exit));
    }
    return c.span("enum", () => {
      const [name, payload] = this.variants[Number(c.integer(bounds, 0n))] as readonly [
        string,
        Generator<unknown> | undefined,
      ];
      return payload === undefined
        ? new Variant(name)
        : new Variant(name, payload[DECODE](c));
    });
  }
}

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
function instantValue(seconds: bigint, units: bigint): Fields {
  return new Fields([
    ["seconds", seconds],
    ["units", units],
  ]);
}

/** Returns the value of a local-date-time: its date and its time of day. */
function localValue(day: bigint, time: bigint): Fields {
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
      if (this.per === 1n) return [first, 0n] as const;
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

/** Returns whether a value of a zone comes from one of its changes. A zone without a change makes no choice. */
function near(c: Case, zone: Zone): boolean {
  if (zone.changes.length === 0) return false;
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
    const per = this.instant.per;
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
    const per = this.local.per;
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

/** An IP address of either version: an index, then 4 or 16 bytes. */
export class IpShape extends Generator<Uint8Array> {
  /** The generators of the two versions' bytes. */
  readonly versions: readonly [Bytes, Bytes];

  constructor(versions: readonly [Bytes, Bytes]) {
    super();
    this.versions = versions;
  }

  /** Returns the address's bytes in network order. */
  [DECODE](c: Case): Uint8Array {
    return c.span("ip-address", () =>
      (this.versions[Number(c.integer(new IntegerBounds(0n, 1n), 0n))] as Bytes)[
        DECODE
      ](c),
    );
  }
}

/** Returns the generator of exactly count bytes. */
function fixedBytes(count: number): Bytes {
  return new Bytes(new SequenceBounds(256, count, count));
}

/** Returns an integer parameter, as a typed literal states an int. */
function intParameter(node: Node, key: string, where: string): bigint {
  try {
    return literal.integer(node[key]);
  } catch {
    throw new ShapeError(
      `prop: ${where}.${key} is ${shown(node[key])}, not an integer`,
    );
  }
}

/** Returns a count parameter of at least 0, or undefined when the node states none. */
function countParameter(node: Node, key: string, where: string): number | undefined {
  if (node[key] === undefined || node[key] === null) return undefined;
  const value = intParameter(node, key, where);
  if (value < 0n) throw new ShapeError(`prop: ${where}.${key} is ${value}, below 0`);
  return Number(value);
}

/** Returns min_size, 0 by default, and max_size, unbounded by default. */
function sizesOf(node: Node, where: string): Sizes {
  const lo = countParameter(node, "min_size", where) ?? 0;
  const hi = countParameter(node, "max_size", where);
  if (hi !== undefined && hi < lo)
    throw new ShapeError(`prop: ${where}: sizes [${lo}, ${hi}] are empty`);
  return new Sizes(lo, hi);
}

/** Returns the units in a second of a time shape's unit. */
function unitOf(node: Node, where: string): bigint {
  const per = UNITS.get(node["unit"] as string);
  if (per === undefined) {
    throw new ShapeError(
      `prop: ${where}.unit is ${shown(node["unit"])}, not one of ms, ns, s, us`,
    );
  }
  return per;
}

/** Returns the units within a second that the digits of a fraction state. */
function fractionUnits(digits: string | undefined, per: bigint, where: string): bigint {
  if (digits === undefined || digits === "") return 0n;
  const scale = 10n ** BigInt(digits.length);
  const scaled = BigInt(digits) * per;
  if (scaled % scale !== 0n)
    throw new ShapeError(`prop: ${where} states a fraction finer than its unit`);
  return scaled / scale;
}

/** Reports whether year is a leap year of the proleptic Gregorian calendar. */
function leap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The days of each month of a year that is no leap year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Returns the days since 1970-01-01 of a date of the proleptic Gregorian calendar. */
function dayOf(year: string, month: string, day: string, where: string): bigint {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const length = m === 2 && leap(y) ? 29 : (MONTH_DAYS[m - 1] ?? 0);
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > length) {
    throw new ShapeError(
      `prop: ${where} states ${year}-${month}-${day}, which is no date`,
    );
  }
  // The days from 1970-01-01 of a civil date, by counting eras of 400 years.
  const shifted = m <= 2 ? y - 1 : y;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return BigInt(era * 146_097 + dayOfEra - 719_468);
}

/** Returns the seconds since midnight of a time of day. */
function timeOf(hour: string, minute: string, second: string, where: string): bigint {
  const h = Number(hour);
  const m = Number(minute);
  const s = Number(second);
  if (h > 23 || m > 59 || s > 59) {
    throw new ShapeError(
      `prop: ${where} states ${hour}:${minute}:${second}, which is no time`,
    );
  }
  return BigInt(h * 3600 + m * 60 + s);
}

/** Returns the integers that a shape's min and max bound, inside fallback. */
function rangeOf(
  node: Node,
  where: string,
  fallback: readonly [bigint, bigint],
  parse: (value: unknown) => bigint,
): readonly [bigint, bigint] {
  const lo =
    node["min"] === undefined || node["min"] === null
      ? fallback[0]
      : parse(node["min"]);
  const hi =
    node["max"] === undefined || node["max"] === null
      ? fallback[1]
      : parse(node["max"]);
  if (!(fallback[0] <= lo && lo <= hi && hi <= fallback[1])) {
    throw new ShapeError(
      `prop: ${where} bounds [${lo}, ${hi}] are empty or outside [${fallback[0]}, ${fallback[1]}]`,
    );
  }
  return [lo, hi];
}

/** Returns the bounds of one integer choice that a shape's min and max state. */
function bounded(
  node: Node,
  where: string,
  fallback: readonly [bigint, bigint],
  parse: (value: unknown) => bigint,
): IntegerBounds {
  const [lo, hi] = rangeOf(node, where, fallback, parse);
  return new IntegerBounds(lo, hi);
}

/** Returns the bounds of a two-choice shape, each a first and a second part. */
function pairBounds(
  node: Node,
  where: string,
  fallback: readonly [Pair, Pair],
  parse: (value: unknown) => Pair,
): readonly [Pair, Pair] {
  const lo =
    node["min"] === undefined || node["min"] === null
      ? fallback[0]
      : parse(node["min"]);
  const hi =
    node["max"] === undefined || node["max"] === null
      ? fallback[1]
      : parse(node["max"]);
  const inside =
    comparePairs(fallback[0], lo) <= 0 &&
    comparePairs(lo, hi) <= 0 &&
    comparePairs(hi, fallback[1]) <= 0;
  if (!inside)
    throw new ShapeError(
      `prop: ${where} bounds ${lo} to ${hi} are empty or out of range`,
    );
  return [lo, hi];
}

/**
 * Returns the names that each name of a graph refers to through a path of
 * edges. A name refers to itself only through a cycle.
 *
 * @param graph - The names that each name refers to directly.
 * @returns The names that each name refers to through a path.
 */
function closure(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Set<string>> {
  const paths = new Map([...graph].map(([name, named]) => [name, new Set(named)]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, named] of paths) {
      const wider = new Set(
        [...named].flatMap((target) => [target, ...(paths.get(target) ?? [])]),
      );
      if (wider.size !== named.size) {
        paths.set(name, wider);
        changed = true;
      }
    }
  }
  return paths;
}

/** Reports whether value is a JSON object. */
function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns a stated alphabet's characters, or undefined for the default one, and its size. */
function alphabetOf(
  node: Node,
  where: string,
): readonly [readonly string[] | undefined, number] {
  const characters = node["alphabet"];
  if (characters === undefined || characters === null)
    return [undefined, alphabet.SIZE];
  if (typeof characters !== "string" || characters === "") {
    throw new ShapeError(
      `prop: ${where}.alphabet is ${shown(characters)}, not characters`,
    );
  }
  const chars = [...characters];
  if (new Set(chars).size !== chars.length) {
    throw new ShapeError(`prop: ${where}.alphabet repeats a character`);
  }
  if (chars.some((char) => alphabet.indexOf(char) === undefined)) {
    throw new ShapeError(
      `prop: ${where}.alphabet has a lone surrogate, which is no character`,
    );
  }
  return [chars, chars.length];
}

/** Returns a list of name and value pairs with distinct, non-empty names. */
function pairsOf(
  node: Node,
  key: string,
  where: string,
): (readonly [string, unknown])[] {
  const items = node[key];
  if (!Array.isArray(items) || items.length === 0) {
    throw new ShapeError(
      `prop: ${where}.${key} is ${shown(items)}, not a list of pairs`,
    );
  }
  const pairs: (readonly [string, unknown])[] = [];
  for (const item of items) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string") {
      throw new ShapeError(
        `prop: ${where}.${key} has ${shown(item)}, not a name and a shape`,
      );
    }
    const name = item[0];
    if (name === "" || pairs.some(([known]) => known === name)) {
      throw new ShapeError(
        `prop: ${where}.${key} names ${shown(name)} twice or not at all`,
      );
    }
    pairs.push([name, item[1]]);
  }
  return pairs;
}

/** One shape file being read: its definitions, the generators of the names it does not define, and the budget of its values. */
class Reader {
  readonly #document: Node;
  readonly #externals: ReadonlyMap<string, Generator<unknown>>;
  readonly budget = new Budget();
  readonly built = new Map<string, Generator<unknown>>();
  readonly #sources = new Map<string, Node>();
  cyclic: ReadonlySet<string> = new Set();

  constructor(document: Node, externals: ReadonlyMap<string, Generator<unknown>>) {
    this.#document = document;
    this.#externals = externals;
  }

  /** Reads the definitions, checks that each has a finite value, then reads the root. */
  root(): Generator<unknown> {
    const definitions =
      "definitions" in this.#document ? this.#document["definitions"] : {};
    if (!isNode(definitions)) {
      throw new ShapeError("prop: definitions is not a map of names to shapes");
    }
    for (const [name, node] of Object.entries(definitions)) {
      if (!isNode(node))
        throw new ShapeError(
          `prop: definitions.${name} is ${shown(node)}, not a shape`,
        );
      this.#sources.set(name, node);
    }
    const source = this.#document["source"];
    const stated =
      source === undefined ||
      source === null ||
      (isNode(source) &&
        typeof source["language"] === "string" &&
        typeof source["type"] === "string");
    if (!stated)
      throw new ShapeError(
        `prop: source is ${shown(source)}, not a language and a type`,
      );
    this.cyclic = this.#cyclicNames();
    this.#finite();
    for (const [name, generator] of this.#externals) {
      if (!this.#sources.has(name)) this.built.set(name, generator);
    }
    for (const [name, node] of this.#sources) {
      this.built.set(name, this.build(node, `definitions.${name}`));
    }
    const root = this.build(this.#document, "shape", true);
    return this.cyclic.size > 0 ? new Root(root, this.budget) : root;
  }

  /**
   * Returns the name of every ref inside node, without following refs. With
   * stopAtExits, a container that can always exit is not entered, so only
   * the refs that every value of node expands remain.
   */
  refs(node: unknown, stopAtExits = false): string[] {
    if (Array.isArray(node))
      return node.flatMap((item) => this.refs(item, stopAtExits));
    if (!isNode(node)) return [];
    if (node["shape"] === "ref") return [String(node["name"])];
    if (stopAtExits && this.exits(node)) return [];
    return Object.entries(node)
      .filter(([key]) => !ROOT_KEYS.has(key) && key !== "values")
      .flatMap(([, value]) => this.refs(value, stopAtExits));
  }

  /** Returns the definitions that can refer to themselves through refs. */
  #cyclicNames(): Set<string> {
    const graph = this.#graph(false);
    const targets = [
      ...this.refs(this.#document),
      ...[...graph.values()].flatMap((named) => [...named]),
    ];
    const unknown = targets.find(
      (target) => !this.#sources.has(target) && !this.#externals.has(target),
    );
    if (unknown !== undefined) {
      throw new ShapeError(
        `prop: a ref names ${shown(unknown)}, which is no definition`,
      );
    }
    const paths = closure(graph);
    return new Set(
      [...paths].filter(([name, named]) => named.has(name)).map(([name]) => name),
    );
  }

  /**
   * Returns the refs of each definition. With stopAtExits, only the refs that
   * every value of the definition expands.
   */
  #graph(stopAtExits: boolean): Map<string, Set<string>> {
    return new Map(
      [...this.#sources].map(([name, node]) => [
        name,
        new Set(this.refs(node, stopAtExits)),
      ]),
    );
  }

  /** Reports whether node contains a ref to a definition that can refer to itself. */
  refersBack(node: unknown): boolean {
    return this.refs(node).some((name) => this.cyclic.has(name));
  }

  /**
   * Reports whether a container can always take an exit: an optional can be
   * absent, a list, a set or a map without a minimum size can be empty, and
   * an enum can take a variant that does not refer back.
   */
  exits(node: Node): boolean {
    const kind = node["shape"];
    if (kind === "optional") return true;
    if (kind === "list" || kind === "set" || kind === "map") {
      return (
        node["min_size"] === undefined ||
        node["min_size"] === null ||
        node["min_size"] === 0
      );
    }
    return kind === "enum" && this.exitVariant(node) !== undefined;
  }

  /** Returns the index of an enum's first variant that does not refer back. */
  exitVariant(node: Node): number | undefined {
    const variants = node["variants"];
    const listed = Array.isArray(variants) ? variants : [];
    const index = listed.findIndex((variant) => {
      const payload =
        Array.isArray(variant) && variant.length === 2 ? variant[1] : undefined;
      return !this.refersBack(payload);
    });
    return index < 0 ? undefined : index;
  }

  /** Refuses a definition that refers to itself through refs that every value expands. */
  #finite(): void {
    const must = closure(this.#graph(true));
    const endless = [...this.cyclic].sort().find((name) => must.get(name)?.has(name));
    if (endless !== undefined) {
      throw new ShapeError(
        `prop: definitions.${endless} has no finite value, because it refers back without an optional, a list, a set, a map or an enum that can exit`,
      );
    }
  }

  /** Returns the generator of one shape. */
  build(node: Node, where: string, root = false): Generator<unknown> {
    const kind = node["shape"];
    const keys = typeof kind === "string" ? KEYS.get(kind) : undefined;
    if (keys === undefined)
      throw new ShapeError(`prop: ${where} is ${shown(kind)}, which is no shape`);
    const [required, optional] = keys;
    const stated = Object.keys(node).filter(
      (key) => key !== "shape" && !(root && ROOT_KEYS.has(key)),
    );
    const missing = required.filter((key) => !stated.includes(key)).sort();
    if (missing.length > 0) {
      throw new ShapeError(
        `prop: ${where} states no ${missing[0]}, which the ${kind} shape needs`,
      );
    }
    const extra = stated
      .filter((key) => !required.includes(key) && !optional.includes(key))
      .sort();
    if (extra.length > 0) {
      throw new ShapeError(
        `prop: ${where}.${extra[0]} does not apply to the ${kind} shape`,
      );
    }
    try {
      return (BUILDERS.get(kind as string) as Builder)(this, node, where);
    } catch (err) {
      if (err instanceof ShapeError) throw err;
      throw new ShapeError(`prop: ${where}: ${(err as Error).message}`);
    }
  }

  /** Returns the generator of a shape nested in another. */
  child(node: unknown, where: string): Generator<unknown> {
    if (!isNode(node))
      throw new ShapeError(`prop: ${where} is ${shown(node)}, not a shape`);
    return this.build(node, where);
  }
}

/** Reads one shape's node into its generator. */
type Builder = (reader: Reader, node: Node, where: string) => Generator<unknown>;

/** Returns the generator of an int of the stated width and signedness. */
function intShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const width = intParameter(node, "width", where);
  const signed = node["signed"];
  if (!INT_WIDTHS.has(Number(width)) || typeof signed !== "boolean") {
    throw new ShapeError(
      `prop: ${where} states width ${shown(node["width"])} and signed ${shown(signed)}`,
    );
  }
  const widest: readonly [bigint, bigint] = signed
    ? [-(1n << (width - 1n)), (1n << (width - 1n)) - 1n]
    : [0n, (1n << width) - 1n];
  const [lo, hi] = rangeOf(node, where, widest, literal.integer);
  if (width === 128n) return new Int128Shape(lo, hi);
  return new Integer(new IntegerBounds(lo, hi));
}

/** Returns the generator of a float of the stated width. */
function floatShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const width = Number(intParameter(node, "width", where));
  if (width !== 32 && width !== 64)
    throw new ShapeError(`prop: ${where}.width is ${width}, not 32 or 64`);
  const allowNan = "allow_nan" in node ? node["allow_nan"] : false;
  const infinite = "allow_infinity" in node ? node["allow_infinity"] : false;
  if (typeof allowNan !== "boolean" || typeof infinite !== "boolean") {
    throw new ShapeError(
      `prop: ${where} states allow_nan or allow_infinity as no boolean`,
    );
  }
  const edge = infinite ? Number.POSITIVE_INFINITY : FLOAT_MAX[width];
  const lo =
    node["min"] === undefined || node["min"] === null
      ? -edge
      : literal.number(node["min"]);
  const hi =
    node["max"] === undefined || node["max"] === null
      ? edge
      : literal.number(node["max"]);
  if (infinite && Number.isFinite(lo) && Number.isFinite(hi)) {
    throw new ShapeError(`prop: ${where} allows the infinities and bounds out both`);
  }
  return new Float(new FloatBounds(lo, hi, allowNan, width));
}

/** Returns the generator of one character of the alphabet. */
function charShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const [characters, size] = alphabetOf(node, where);
  return new Text(characters, new SequenceBounds(size, 1, 1));
}

/** Returns the generator of a string: over an alphabet, or matching a pattern. */
function stringShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  if ("pattern" in node) {
    if (["alphabet", "min_size", "max_size"].some((key) => key in node)) {
      throw new ShapeError(`prop: ${where} states a pattern and an alphabet or a size`);
    }
    const text = node["pattern"];
    if (typeof text !== "string")
      throw new ShapeError(`prop: ${where}.pattern is ${shown(text)}, not a pattern`);
    return new Matching(piece(text));
  }
  const [characters, size] = alphabetOf(node, where);
  const sizes = sizesOf(node, where);
  return new Text(characters, new SequenceBounds(size, sizes.minSize, sizes.maxSize));
}

/** Returns the generator of a byte string. */
function bytesShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const sizes = sizesOf(node, where);
  return new Bytes(new SequenceBounds(256, sizes.minSize, sizes.maxSize));
}

/** Returns the generator of a list, a fixed-list or a set. */
function listShape(reader: Reader, node: Node, where: string): Generator<unknown> {
  const kind = node["shape"];
  const of = reader.child(node["of"], `${where}.of`);
  let sizes: Sizes;
  if (kind === "fixed-list") {
    const size = countParameter(node, "size", where);
    if (size === undefined)
      throw new ShapeError(`prop: ${where} is a fixed-list and states no size`);
    sizes = new Sizes(size, size);
  } else {
    sizes = sizesOf(node, where);
  }
  const exits = kind !== "fixed-list" && reader.exits(node) && reader.refersBack(node);
  return new ListShape(of, sizes, kind === "set", exits, reader.budget);
}

/** Returns the generator of a map from keys to values. */
function mapShape(reader: Reader, node: Node, where: string): Generator<unknown> {
  const key = reader.child(node["key"], `${where}.key`);
  const of = reader.child(node["of"], `${where}.of`);
  const exits = reader.exits(node) && reader.refersBack(node);
  return new MapShape(key, of, sizesOf(node, where), exits, reader.budget);
}

/** Returns the generator of an optional value. */
function optionalShape(reader: Reader, node: Node, where: string): Generator<unknown> {
  const of = reader.child(node["of"], `${where}.of`);
  return new OptionalShape(of, reader.refersBack(node), reader.budget);
}

/** Returns the generator of a record of named fields. */
function recordShape(reader: Reader, node: Node, where: string): Generator<unknown> {
  return new RecordShape(
    pairsOf(node, "fields", where).map(
      ([name, of]) => [name, reader.child(of, `${where}.${name}`)] as const,
    ),
  );
}

/** Returns the generator of an enum of named variants with optional payloads. */
function enumShape(reader: Reader, node: Node, where: string): Generator<unknown> {
  const variants = pairsOf(node, "variants", where).map(
    ([name, of]) =>
      [
        name,
        of === null || of === undefined
          ? undefined
          : reader.child(of, `${where}.${name}`),
      ] as const,
  );
  const exit = reader.refersBack(node) ? reader.exitVariant(node) : undefined;
  return new EnumShape(variants, exit, reader.budget);
}

/** Returns the generator of one of the stated values. */
function literalShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const values = node["values"];
  if (!Array.isArray(values) || values.length === 0) {
    throw new ShapeError(
      `prop: ${where}.values is ${shown(values)}, not a list of literals`,
    );
  }
  return new SampledFrom(values.map(literal.decode));
}

/** Returns the generator of a named definition. The reader refused every ref to no definition before it built a shape. */
function refShape(reader: Reader, node: Node): Generator<unknown> {
  const name = String(node["name"]);
  return new Ref(name, reader.built, reader.cyclic.has(name), reader.budget);
}

/** Returns the generator of an IP address of one version or either. */
function ipShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const version = node["version"];
  if (version === undefined || version === null) {
    return new IpShape([fixedBytes(4), fixedBytes(16)]);
  }
  const count = ADDRESS_BYTES.get(version);
  if (count === undefined)
    throw new ShapeError(`prop: ${where}.version is ${shown(version)}, not 4 or 6`);
  return fixedBytes(count);
}

/** Returns the decimal bound key of node, scaled by factor and rounded inward, or undefined. */
function decimalBound(
  node: Node,
  key: string,
  where: string,
  factor: bigint,
  up: boolean,
): bigint | undefined {
  const text = node[key];
  if (text === undefined || text === null) return undefined;
  if (typeof text !== "string" || !DECIMAL.test(text)) {
    throw new ShapeError(`prop: ${where}.${key} is ${shown(text)}, not a decimal`);
  }
  const [whole, fraction = ""] = text.split(".") as [string, string?];
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * factor;
  const quotient = floorDiv(numerator, scale);
  return up && quotient * scale !== numerator ? quotient + 1n : quotient;
}

/** Returns the generator of a decimal's unscaled value at the stated scale. A bound with more digits than the scale rounds inward. */
function decimalShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const scale = countParameter(node, "scale", where);
  if (scale === undefined)
    throw new ShapeError(`prop: ${where} is a decimal and states no scale`);
  const factor = 10n ** BigInt(scale);
  const unscaled: Node = {
    min: decimalBound(node, "min", where, factor, true),
    max: decimalBound(node, "max", where, factor, false),
  };
  return new Integer(
    bounded(unscaled, where, [INT64_MIN, INT64_MAX], (v) => v as bigint),
  );
}

/** Returns the generator of an instant at the stated unit. */
function instantShape(node: Node, where: string): InstantShape {
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
function dateShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const parse = (text: unknown): bigint => {
    const match = typeof text === "string" ? DATE.exec(text) : null;
    if (match === null)
      throw new ShapeError(`prop: ${where} bound ${shown(text)} is no date`);
    return dayOf(match[1] as string, match[2] as string, match[3] as string, where);
  };
  return new Integer(bounded(node, where, [FIRST_DAY, LAST_DAY], parse));
}

/** Returns the generator of a time of day, in units since midnight. */
function timeOfDayShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const per = unitOf(node, where);
  const parse = (text: unknown): bigint => {
    const match = typeof text === "string" ? TIME.exec(text) : null;
    if (match === null)
      throw new ShapeError(`prop: ${where} bound ${shown(text)} is no time of day`);
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
function localShape(node: Node, where: string): LocalDateTimeShape {
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
function durationShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  const largest = MAX_DURATION_NS / (1_000_000_000n / unitOf(node, where));
  return new Integer(bounded(node, where, [-largest, largest], literal.integer));
}

/** Returns the generator of an offset from UTC, in seconds east of it. */
function offsetShape(_reader: Reader, node: Node, where: string): Generator<unknown> {
  return new Integer(bounded(node, where, [-MAX_OFFSET, MAX_OFFSET], literal.integer));
}

/** The builder of each shape, by id. */
const BUILDERS: ReadonlyMap<string, Builder> = new Map<string, Builder>([
  ["bool", () => new Bool({ num: 1n, den: 2n })],
  ["int", intShape],
  ["float", floatShape],
  ["char", charShape],
  ["string", stringShape],
  ["bytes", bytesShape],
  ["list", listShape],
  ["fixed-list", listShape],
  ["set", listShape],
  ["map", mapShape],
  ["optional", optionalShape],
  ["record", recordShape],
  ["enum", enumShape],
  ["literal", literalShape],
  ["ref", refShape],
  ["uuid", () => fixedBytes(UUID_BYTES)],
  ["ip-address", ipShape],
  ["decimal", decimalShape],
  ["instant", (_reader, node, where) => instantShape(node, where)],
  ["date", dateShape],
  ["time-of-day", timeOfDayShape],
  ["local-date-time", (_reader, node, where) => localShape(node, where)],
  ["duration", durationShape],
  ["offset", offsetShape],
  ["zone", () => new SampledFrom(ZONES.map((zone) => zone.name))],
  [
    "zoned-date-time",
    (_reader, node, where) =>
      new ZonedShape(instantShape({ unit: node["unit"] }, where)),
  ],
  [
    "wall-time",
    (_reader, node, where) => new WallShape(localShape({ unit: node["unit"] }, where)),
  ],
]);

/**
 * Returns the generator of a shape file. A ref to a name that the file does
 * not define decodes the value of the generator that externals states for
 * the name. Such a generator counts no node of the budget, and the read
 * follows no ref inside it.
 *
 * @param document - The shape file, as its JSON parses.
 * @param externals - The generators of names that the file does not define.
 * @returns The generator.
 * @throws ShapeError for a shape that the vocabulary does not have, a key
 *   that a shape does not take, a parameter that it cannot read, a ref to a
 *   name that neither the file nor externals states, and a definition with
 *   no finite value.
 */
export function read(
  document: unknown,
  externals: ReadonlyMap<string, Generator<unknown>> = new Map(),
): Generator<unknown> {
  if (!isNode(document))
    throw new ShapeError(`prop: ${shown(document)} is not a shape`);
  return new Reader(document, externals).root();
}
