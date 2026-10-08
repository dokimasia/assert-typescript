/**
 * The TypeScript values of shapes: how a generator of a shape file turns the
 * value that the engine decodes into the value that a body receives, and
 * back.
 *
 * | Shape | TypeScript value |
 * | --- | --- |
 * | bool, float, char, string, bytes, zone | boolean, number, string, string, Uint8Array, string |
 * | int of 8, 16 or 32 bits | number |
 * | int of 64 or 128 bits | bigint |
 * | list, fixed-list | an array |
 * | set | a Set |
 * | map | a Map |
 * | record | a plain object of its fields, in their order |
 * | enum | `{ name }`, and `{ name, payload }` for a variant with a payload |
 * | optional | undefined, or the value |
 * | literal | the value of its typed literal, with an int as a bigint |
 * | uuid | its text, in lowercase |
 * | ip-address | its text: dotted for version 4, and as RFC 5952 states for version 6 |
 * | decimal | its text, with as many digits after the point as its scale |
 * | instant, date, time-of-day | Temporal.Instant, Temporal.PlainDate, Temporal.PlainTime |
 * | local-date-time, zoned-date-time | Temporal.PlainDateTime, Temporal.ZonedDateTime |
 * | duration | Temporal.Duration, balanced from the hours down |
 * | offset | the seconds east of UTC, a number |
 * | wall-time | `{ local, zone }`: a Temporal.PlainDateTime and the zone's name |
 *
 * The way back takes the TypeScript value, and also the value that the
 * engine decodes, so a typed literal of a store entry or of the draws
 * option runs back through the shape. A value of neither form throws.
 */

import { decode } from "./engine/literal.js";
import { canonical, Fields, Pairs, Variant } from "./engine/value.js";

/** A shape as its JSON states it. */
type Node = Readonly<Record<string, unknown>>;

/** How the values of one shape convert. */
export interface Converter {
  /** Returns the TypeScript value of a value that the engine decoded from the shape. */
  readonly to: (value: unknown) => unknown;
  /**
   * Returns the engine's value of a TypeScript value of the shape, or of a
   * value of the engine's form.
   *
   * @throws TypeError or RangeError for a value of neither form.
   */
  readonly back: (value: unknown) => unknown;
}

/**
 * The converter of a value that is the same in both forms: a value of a
 * shape whose TypeScript values are the engine's, and a value of a
 * registered generator, which is a TypeScript value already.
 */
export const IDENTITY: Converter = { to: (value) => value, back: (value) => value };

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

/** The units of a time shape, as the nanoseconds of one unit. */
const UNIT_NANOSECONDS: ReadonlyMap<unknown, bigint> = new Map([
  ["s", 1_000_000_000n],
  ["ms", 1_000_000n],
  ["us", 1_000n],
  ["ns", 1n],
]);

/** The first day of the days that a date counts. */
const EPOCH = Temporal.PlainDate.from("1970-01-01");

/** The text of a UUID, and of an IPv4 address. */
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_TEXT =
  /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const DECIMAL_TEXT = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Returns the JSON text of a value, for an error's message. */
function shown(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  return JSON.stringify(value) ?? String(value);
}

/** Throws a TypeError for a value that is no value of the shape. */
function refuse(value: unknown, shape: string): never {
  throw new TypeError(`prop: ${shown(value)} is no value of the ${shape} shape`);
}

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

/** Returns the two parts of the value of a time shape of two parts. */
function partsOf(value: unknown): readonly [unknown, unknown] {
  const fields = (value as Fields).fields;
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

/** Returns the converter of an instant at a unit of unit nanoseconds. */
function instantOf(unit: bigint): Converter {
  return {
    to: (value) => {
      const [seconds, units] = partsOf(value) as [bigint, bigint];
      return Temporal.Instant.fromEpochNanoseconds(seconds * SECOND + units * unit);
    },
    back: (value) => {
      if (value instanceof Fields) return value;
      if (!(value instanceof Temporal.Instant)) refuse(value, "instant");
      const [seconds, nanoseconds] = divmod(value.epochNanoseconds, SECOND);
      return twoParts("seconds", seconds, "units", whole(nanoseconds, unit, value));
    },
  };
}

/** Returns the days since 1970-01-01 of a date. */
function daysOf(date: Temporal.PlainDate): bigint {
  return BigInt(EPOCH.until(date, { largestUnit: "days" }).days);
}

/** The converter of a date. */
const DATE: Converter = {
  to: (value) => EPOCH.add({ days: Number(value) }),
  back: (value) => {
    if (typeof value === "bigint") return value;
    if (!(value instanceof Temporal.PlainDate)) refuse(value, "date");
    return daysOf(value);
  },
};

/** Returns the nanoseconds since midnight of a time of day. */
function sinceMidnight(time: Temporal.PlainTime): bigint {
  const seconds = (time.hour * 60 + time.minute) * 60 + time.second;
  const fraction =
    (time.millisecond * 1000 + time.microsecond) * 1000 + time.nanosecond;
  return BigInt(seconds) * SECOND + BigInt(fraction);
}

/** Returns the time of day of nanoseconds since midnight. */
function timeAt(nanoseconds: bigint): Temporal.PlainTime {
  return Temporal.PlainTime.from("00:00").add(durationOf(nanoseconds));
}

/** Returns the converter of a time of day at a unit of unit nanoseconds. */
function timeOfDayOf(unit: bigint): Converter {
  return {
    to: (value) => timeAt((value as bigint) * unit),
    back: (value) => {
      if (typeof value === "bigint") return value;
      if (!(value instanceof Temporal.PlainTime)) refuse(value, "time-of-day");
      return whole(sinceMidnight(value), unit, value);
    },
  };
}

/** Returns the converter of a local date and time at a unit of unit nanoseconds. */
function localOf(unit: bigint): Converter {
  return {
    to: (value) => {
      const [days, units] = partsOf(value) as [bigint, bigint];
      return (DATE.to(days) as Temporal.PlainDate).toPlainDateTime(
        timeAt(units * unit),
      );
    },
    back: (value) => {
      if (value instanceof Fields) return value;
      if (!(value instanceof Temporal.PlainDateTime)) refuse(value, "local-date-time");
      const units = whole(sinceMidnight(value.toPlainTime()), unit, value);
      return twoParts("date", daysOf(value.toPlainDate()), "time-of-day", units);
    },
  };
}

/** Returns the converter of a duration at a unit of unit nanoseconds. */
function durationShapeOf(unit: bigint): Converter {
  return {
    to: (value) => durationOf((value as bigint) * unit),
    back: (value) => {
      if (typeof value === "bigint") return value;
      if (!(value instanceof Temporal.Duration)) refuse(value, "duration");
      return whole(nanosecondsOf(value), unit, value);
    },
  };
}

/** Returns the converter of an instant in a zone at a unit of unit nanoseconds. */
function zonedOf(unit: bigint): Converter {
  const instant = instantOf(unit);
  return {
    to: (value) => {
      const [at, zone] = partsOf(value);
      return (instant.to(at) as Temporal.Instant).toZonedDateTimeISO(zone as string);
    },
    back: (value) => {
      if (value instanceof Fields) return value;
      if (!(value instanceof Temporal.ZonedDateTime)) refuse(value, "zoned-date-time");
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
function wallOf(unit: bigint): Converter {
  const local = localOf(unit);
  return {
    to: (value) => {
      const [at, zone] = partsOf(value);
      return { local: local.to(at), zone };
    },
    back: (value) => {
      if (value instanceof Fields) return value;
      const { local: at, zone } = (value ?? {}) as { local?: unknown; zone?: unknown };
      if (!(at instanceof Temporal.PlainDateTime) || typeof zone !== "string")
        refuse(value, "wall-time");
      return twoParts("local-date-time", local.back(at), "zone", zone);
    },
  };
}

/** The converter of a UUID. */
const UUID: Converter = {
  to: (value) => {
    const hex = Buffer.from(value as Uint8Array).toString("hex");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  },
  back: (value) => {
    if (value instanceof Uint8Array) return value;
    if (typeof value !== "string" || !UUID_TEXT.test(value)) refuse(value, "uuid");
    return Uint8Array.from(Buffer.from(value.replaceAll("-", ""), "hex"));
  },
};

/** Returns the text of an IPv6 address, as RFC 5952 states it: the longest run of two or more zero groups, the first of equal runs, as `::`. */
function ipv6Text(bytes: Uint8Array): string {
  const groups = Array.from(
    { length: 8 },
    (_, i) => ((bytes[2 * i] as number) << 8) | (bytes[2 * i + 1] as number),
  );
  let [start, length] = [-1, 1];
  for (let i = 0; i < 8; i += 1) {
    let end = i;
    while (end < 8 && groups[end] === 0) end += 1;
    if (end - i > length) [start, length] = [i, end - i];
  }
  const text = groups.map((group) => group.toString(16));
  if (start < 0) return text.join(":");
  return `${text.slice(0, start).join(":")}::${text.slice(start + length).join(":")}`;
}

/** Returns the 16 bytes of an IPv6 address that the URL parser accepts, and undefined for other text. */
function ipv6Bytes(text: string): Uint8Array | undefined {
  let host: string;
  try {
    host = new URL(`http://[${text}]`).hostname;
  } catch {
    return undefined;
  }
  const [head, tail] = host.slice(1, -1).split("::") as [string, string?];
  const groupsOf = (part: string | undefined): number[] =>
    part === undefined || part === ""
      ? []
      : part.split(":").map((group) => Number.parseInt(group, 16));
  const first = groupsOf(head);
  const last = groupsOf(tail);
  const groups = [
    ...first,
    ...new Array<number>(8 - first.length - last.length).fill(0),
    ...last,
  ];
  return Uint8Array.from(groups.flatMap((group) => [group >> 8, group & 0xff]));
}

/** The converter of an IP address. */
const IP_ADDRESS: Converter = {
  to: (value) => {
    const bytes = value as Uint8Array;
    return bytes.length === 4 ? bytes.join(".") : ipv6Text(bytes);
  },
  back: (value) => {
    if (value instanceof Uint8Array) return value;
    if (typeof value !== "string") refuse(value, "ip-address");
    const dotted = IPV4_TEXT.exec(value);
    if (dotted !== null) {
      const octets = dotted.slice(1).map(Number);
      if (octets.every((octet) => octet <= 255)) return Uint8Array.from(octets);
      refuse(value, "ip-address");
    }
    return ipv6Bytes(value) ?? refuse(value, "ip-address");
  },
};

/** Returns the converter of a decimal of scale digits after the point. */
function decimalOf(scale: number): Converter {
  return {
    to: (value) => {
      const unscaled = value as bigint;
      const digits = (unscaled < 0n ? -unscaled : unscaled)
        .toString()
        .padStart(scale + 1, "0");
      const sign = unscaled < 0n ? "-" : "";
      if (scale === 0) return `${sign}${digits}`;
      return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    },
    back: (value) => {
      if (typeof value === "bigint") return value;
      const parts = typeof value === "string" ? DECIMAL_TEXT.exec(value) : null;
      if (parts === null) refuse(value, "decimal");
      const [, sign, integral, fraction = ""] = parts as unknown as [
        string,
        string,
        string,
        string?,
      ];
      if (/[^0]/.test(fraction.slice(scale))) {
        throw new RangeError(
          `prop: ${value} has more digits than the scale of ${scale}`,
        );
      }
      const magnitude = BigInt(integral + fraction.slice(0, scale).padEnd(scale, "0"));
      return sign === "-" ? -magnitude : magnitude;
    },
  };
}

/** The converter of an int of 8, 16 or 32 bits, whose TypeScript value is a number. */
const SMALL_INT: Converter = {
  to: (value) => Number(value),
  back: (value) => {
    if (typeof value === "bigint") return value;
    if (!Number.isSafeInteger(value)) refuse(value, "int");
    return BigInt(value as number);
  },
};

/** The converter of an offset, whose TypeScript value is the seconds east of UTC. */
const OFFSET: Converter = {
  to: (value) => Number(value),
  back: (value) => {
    if (typeof value === "bigint") return value;
    if (!Number.isSafeInteger(value)) refuse(value, "offset");
    return BigInt(value as number);
  },
};

/**
 * Returns the TypeScript value of a value that a typed literal decodes to: a
 * record as a plain object, a map as a Map, a variant as `{ name }` or
 * `{ name, payload }`, and a list element by element.
 *
 * @param value - The decoded value.
 * @returns The TypeScript value.
 */
export function plainOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainOf);
  if (value instanceof Fields)
    return Object.fromEntries(value.fields.map(([name, v]) => [name, plainOf(v)]));
  if (value instanceof Pairs)
    return new Map(value.items.map(([k, v]) => [plainOf(k), plainOf(v)]));
  if (value instanceof Variant) {
    return value.hasPayload
      ? { name: value.name, payload: plainOf(value.payload) }
      : { name: value.name };
  }
  return value;
}

/** Returns the converter of a literal over decoded values: each converts to its TypeScript value, and back by its canonical text. */
function literalOf(decoded: readonly unknown[]): Converter {
  const keys = new Map<string, unknown>();
  for (const value of decoded) {
    keys.set(canonical(value), value);
    keys.set(canonical(plainOf(value)), value);
  }
  return {
    to: plainOf,
    back: (value) => {
      const key = canonical(value);
      if (!keys.has(key)) refuse(value, "literal");
      return keys.get(key);
    },
  };
}

/** The shapes of a shape file and the converters read so far. */
class Walker {
  readonly #definitions: Readonly<Record<string, unknown>>;
  readonly #named: ReadonlyMap<string, Converter>;
  readonly #built = new Map<string, Converter>();

  constructor(
    definitions: Readonly<Record<string, unknown>>,
    named: ReadonlyMap<string, Converter>,
  ) {
    this.#definitions = definitions;
    this.#named = named;
  }

  /** Returns the converter of a ref: the one that named states for its name, or the definition's, read once. */
  ref(name: string): Converter {
    const stated = this.#named.get(name);
    if (stated !== undefined) return stated;
    const built = this.#built.get(name);
    if (built !== undefined) return built;
    let converter: Converter | undefined;
    const lazy: Converter = {
      to: (value) => (converter as Converter).to(value),
      back: (value) => (converter as Converter).back(value),
    };
    this.#built.set(name, lazy);
    converter = this.convert(this.#definitions[name] as Node);
    return lazy;
  }

  /** Returns the converter of a shape that the engine's reader accepted. */
  convert(node: Node): Converter {
    const kind = node["shape"] as string;
    const unit = UNIT_NANOSECONDS.get(node["unit"]) as bigint;
    switch (kind) {
      case "int":
        return Number(node["width"]) <= 32 ? SMALL_INT : IDENTITY;
      case "list":
      case "fixed-list":
        return this.#list(this.convert(node["of"] as Node));
      case "set":
        return this.#set(this.convert(node["of"] as Node));
      case "map":
        return this.#map(
          this.convert(node["key"] as Node),
          this.convert(node["of"] as Node),
        );
      case "optional":
        return this.#optional(this.convert(node["of"] as Node));
      case "record":
        return this.#record(node["fields"] as readonly (readonly [string, Node])[]);
      case "enum":
        return this.#enum(
          node["variants"] as readonly (readonly [string, Node | null])[],
        );
      case "literal":
        return literalOf((node["values"] as readonly unknown[]).map(decode));
      case "ref":
        return this.ref(node["name"] as string);
      case "uuid":
        return UUID;
      case "ip-address":
        return IP_ADDRESS;
      case "decimal":
        return decimalOf(Number(node["scale"]));
      case "instant":
        return instantOf(unit);
      case "date":
        return DATE;
      case "time-of-day":
        return timeOfDayOf(unit);
      case "local-date-time":
        return localOf(unit);
      case "duration":
        return durationShapeOf(unit);
      case "offset":
        return OFFSET;
      case "zoned-date-time":
        return zonedOf(unit);
      case "wall-time":
        return wallOf(unit);
      default:
        return IDENTITY;
    }
  }

  #list(of: Converter): Converter {
    return {
      to: (value) => (value as unknown[]).map(of.to),
      back: (value) =>
        Array.isArray(value) ? value.map(of.back) : refuse(value, "list"),
    };
  }

  #set(of: Converter): Converter {
    return {
      to: (value) => new Set((value as unknown[]).map(of.to)),
      back: (value) => {
        if (value instanceof Set || Array.isArray(value))
          return [...value].map(of.back);
        return refuse(value, "set");
      },
    };
  }

  #map(key: Converter, of: Converter): Converter {
    return {
      to: (value) =>
        new Map((value as Pairs).items.map(([k, v]) => [key.to(k), of.to(v)])),
      back: (value) => {
        const items =
          value instanceof Pairs
            ? value.items
            : value instanceof Map
              ? [...value]
              : refuse(value, "map");
        return new Pairs(items.map(([k, v]) => [key.back(k), of.back(v)] as const));
      },
    };
  }

  #optional(of: Converter): Converter {
    return {
      to: (value) => (value === undefined ? undefined : of.to(value)),
      back: (value) =>
        value === undefined || value === null ? undefined : of.back(value),
    };
  }

  #record(fields: readonly (readonly [string, Node])[]): Converter {
    const converters = fields.map(
      ([name, node]) => [name, this.convert(node)] as const,
    );
    return {
      to: (value) =>
        Object.fromEntries(
          converters.map(([name, converter], i) => [
            name,
            converter.to(
              ((value as Fields).fields[i] as readonly [string, unknown])[1],
            ),
          ]),
        ),
      back: (value) => {
        if (value instanceof Fields) {
          return new Fields(
            value.fields.map(([name, v], i) => [
              name,
              (converters[i] as readonly [string, Converter])[1].back(v),
            ]),
          );
        }
        if (typeof value !== "object" || value === null) refuse(value, "record");
        const object = value as Readonly<Record<string, unknown>>;
        return new Fields(
          converters.map(
            ([name, converter]) => [name, converter.back(object[name])] as const,
          ),
        );
      },
    };
  }

  #enum(variants: readonly (readonly [string, Node | null])[]): Converter {
    const payloads = new Map(
      variants.map(([name, node]) => [
        name,
        node === null || node === undefined ? undefined : this.convert(node),
      ]),
    );
    return {
      to: (value) => {
        const variant = value as Variant;
        const payload = payloads.get(variant.name);
        return payload === undefined
          ? { name: variant.name }
          : { name: variant.name, payload: payload.to(variant.payload) };
      },
      back: (value) => {
        const stated = value as
          | { name?: unknown; payload?: unknown }
          | null
          | undefined;
        const name = stated?.name;
        if (typeof name !== "string" || !payloads.has(name)) refuse(value, "enum");
        const payload = payloads.get(name);
        return payload === undefined
          ? new Variant(name)
          : new Variant(name, payload.back(stated?.payload));
      },
    };
  }
}

/**
 * Returns the converter of the root of a shape file that the engine's
 * reader accepted. A ref to a name that named states converts with the
 * converter that named states for it, in place of the definition's.
 *
 * @param document - The shape file, as its JSON parses.
 * @param named - The converters of names, such as registered names.
 * @returns The converter.
 */
export function converterOf(
  document: Node,
  named: ReadonlyMap<string, Converter>,
): Converter {
  const definitions = (document["definitions"] ?? {}) as Readonly<
    Record<string, unknown>
  >;
  return new Walker(definitions, named).convert(document);
}
