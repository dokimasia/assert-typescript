// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

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

import { type Converter, IDENTITY, refuse } from "./convert/converter.js";
import { literalOf } from "./convert/literal.js";
import { OFFSET, SMALL_INT, SMALL_INT_WIDTH } from "./convert/numbers.js";
import { decimalOf, IP_ADDRESS, UUID } from "./convert/text.js";
import {
  DATE,
  durationShapeOf,
  instantOf,
  localOf,
  timeOfDayOf,
  UNIT_NANOSECONDS,
  wallOf,
  zonedOf,
} from "./convert/time.js";
import { decode } from "./engine/literal.js";
import { Fields, Pairs, Variant } from "./engine/value.js";

/** A shape as its JSON states it. */
type Node = Readonly<Record<string, unknown>>;

/** Returns the converter of a shape that contains no other shape. */
function leafOf(node: Node): Converter {
  const unit = UNIT_NANOSECONDS.get(node["unit"]) as bigint;
  switch (node["shape"]) {
    case "int":
      return Number(node["width"]) <= SMALL_INT_WIDTH ? SMALL_INT : IDENTITY;
    case "literal":
      return literalOf((node["values"] as readonly unknown[]).map(decode));
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

/** Returns the converter of a list whose elements of converts. */
function listOf(of: Converter): Converter {
  return {
    to: (value) => (value as unknown[]).map(of.to),
    back: (value) =>
      Array.isArray(value) ? value.map(of.back) : refuse(value, "list"),
  };
}

/** Returns the converter of a set whose elements of converts. */
function setOf(of: Converter): Converter {
  return {
    to: (value) => new Set((value as unknown[]).map(of.to)),
    back: (value) => {
      if (value instanceof Set || Array.isArray(value)) {
        return [...value].map(of.back);
      }
      return refuse(value, "set");
    },
  };
}

/** Returns the converter of a map whose keys key converts and whose values of converts. */
function mapOf(key: Converter, of: Converter): Converter {
  return {
    to: (value) =>
      new Map((value as Pairs).items.map(([k, v]) => [key.to(k), of.to(v)])),
    back: (value) => {
      if (!(value instanceof Pairs || value instanceof Map)) {
        refuse(value, "map");
      }
      const items: readonly (readonly [unknown, unknown])[] =
        value instanceof Pairs ? value.items : [...value];
      return new Pairs(items.map(([k, v]) => [key.back(k), of.back(v)] as const));
    },
  };
}

/** Returns the converter of an optional value whose value of converts. */
function optionalOf(of: Converter): Converter {
  return {
    to: (value) => (value === undefined ? undefined : of.to(value)),
    back: (value) =>
      value === undefined || value === null ? undefined : of.back(value),
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
    if (stated !== undefined) {
      return stated;
    }
    const built = this.#built.get(name);
    if (built !== undefined) {
      return built;
    }
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
    switch (node["shape"]) {
      case "list":
      case "fixed-list":
        return listOf(this.convert(node["of"] as Node));
      case "set":
        return setOf(this.convert(node["of"] as Node));
      case "map":
        return mapOf(
          this.convert(node["key"] as Node),
          this.convert(node["of"] as Node),
        );
      case "optional":
        return optionalOf(this.convert(node["of"] as Node));
      case "record":
        return this.#record(node["fields"] as readonly (readonly [string, Node])[]);
      case "enum":
        return this.#enum(
          node["variants"] as readonly (readonly [string, Node | null])[],
        );
      case "ref":
        return this.ref(node["name"] as string);
      default:
        return leafOf(node);
    }
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
        if (typeof value !== "object" || value === null) {
          refuse(value, "record");
        }
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
        if (typeof name !== "string" || !payloads.has(name)) {
          refuse(value, "enum");
        }
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
