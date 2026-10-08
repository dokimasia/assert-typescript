/**
 * The typed literal of a value that a body drew, as its generator states the
 * value's type.
 *
 * A draw's type is its generator's, so a float that is integral is still a
 * float, and a value that a map with an inverse built is stated as the
 * value that it maps from. A store entry and a property's call record state
 * each draw this way, so an entry's counterexample runs back through the
 * draws option.
 */

import { encode, type Literal } from "../record/literal.js";
import type { Decoder } from "./engine/case.js";
import {
  Bool,
  Bytes,
  Dict,
  Filter,
  Float,
  Integer,
  List,
  Mapped,
  Matching,
  Optional,
  Text,
} from "./engine/generator.js";
import * as engine from "./engine/literal.js";
import {
  EnumShape,
  Int128Shape,
  IpShape,
  ListShape,
  MapShape,
  OptionalShape,
  RecordShape,
  Ref,
  Root,
} from "./engine/shape.js";
import { Fields, Pairs, Variant } from "./engine/value.js";

/** The scalar types of a list's `of`. */
const SCALARS = new Set(["bool", "int", "float", "string"]);

/**
 * Returns the literal of a value whose generator states no type of its own:
 * the engine's literal of a decoded record, dict or variant, and the
 * library's literal of any other value.
 */
function generic(value: unknown): Literal | undefined {
  if (value instanceof Pairs || value instanceof Fields || value instanceof Variant) {
    try {
      return engine.encode(value);
    } catch {
      return undefined;
    }
  }
  return encode(value);
}

/** Returns the literal of a list whose elements have the literals items. */
function listOf(items: readonly (Literal | undefined)[]): Literal | undefined {
  if (items.some((item) => item === undefined)) return undefined;
  const literals = items as readonly Literal[];
  const [first] = literals;
  const scalar =
    first !== undefined &&
    SCALARS.has(first.type) &&
    literals.every((item) => item.type === first.type);
  if (scalar)
    return {
      type: "list",
      of: first.type,
      value: literals.map((item) => item["value"]),
    };
  return { type: "list", items: literals };
}

/** Returns the literal of a dict's entries, each through the generators of its key and its value. */
function mapOf(keys: Decoder, values: Decoder, value: unknown): Literal | undefined {
  if (!(value instanceof Pairs)) return generic(value);
  const entries = value.items.map(([k, v]) => [
    drawnLiteral(keys, k),
    drawnLiteral(values, v),
  ]);
  if (entries.some(([k, v]) => k === undefined || v === undefined)) return undefined;
  return { type: "map", entries };
}

/** Returns the literal of a scalar of type. */
function scalarOf(type: string, value: unknown): Literal {
  return { type, value: engine.plain(value) };
}

/** Returns the literal of a record, each field through the generator of its field. */
function recordOf(generator: RecordShape, value: unknown): Literal | undefined {
  if (!(value instanceof Fields)) return generic(value);
  const fields = generator.fields.map(([name, of], i) => [
    name,
    drawnLiteral(of, (value.fields[i] as readonly [string, unknown])[1]),
  ]);
  if (fields.some(([, literal]) => literal === undefined)) return undefined;
  return { type: "record", fields };
}

/** Returns the literal of a variant, its payload through the generator of the variant's payload. */
function variantOf(generator: EnumShape, value: unknown): Literal | undefined {
  if (!(value instanceof Variant)) return generic(value);
  const payload = generator.variants.find(([name]) => name === value.name)?.[1];
  if (!value.hasPayload || payload === undefined) return generic(value);
  const literal = drawnLiteral(payload, value.payload);
  return literal === undefined
    ? undefined
    : { type: "variant", name: value.name, payload: literal };
}

/** Returns the literal of a value that a map built, as the value that the map's inverse returns for it. */
function mappedOf(
  generator: Mapped<unknown, unknown>,
  value: unknown,
): Literal | undefined {
  if (generator.back === undefined) return generic(value);
  let inner: unknown;
  try {
    inner = generator.back(value);
  } catch {
    return generic(value);
  }
  return drawnLiteral(generator.of, inner);
}

/** Returns the literal of an optional value: null for an absent one, and the value's through of otherwise. */
function optionalOf(of: Decoder, value: unknown): Literal | undefined {
  return value === undefined ? { type: "null" } : drawnLiteral(of, value);
}

/** Returns the literal of a list, each element through of. */
function elementsOf(of: Decoder, value: unknown): Literal | undefined {
  if (!Array.isArray(value)) return generic(value);
  return listOf(value.map((item) => drawnLiteral(of, item)));
}

/** Returns the generator that a generator decodes its values with, for a filter, a shape file's root and a ref, and undefined for any other generator. */
function wrapped(generator: Decoder): Decoder | undefined {
  if (generator instanceof Filter) return generator.of;
  if (generator instanceof Root) return generator.node;
  if (generator instanceof Ref) return generator.definitions.get(generator.name);
  return undefined;
}

/**
 * Returns the typed literal of a value that generator decoded, as the
 * generator states its type, or undefined when no typed literal states it.
 *
 * @param generator - The draw's generator.
 * @param value - The value.
 * @returns The literal, or undefined.
 */
export function drawnLiteral(generator: Decoder, value: unknown): Literal | undefined {
  const inner = wrapped(generator);
  if (inner !== undefined) return drawnLiteral(inner, value);
  if (generator instanceof Mapped) return mappedOf(generator, value);
  if (generator instanceof Optional || generator instanceof OptionalShape) {
    return optionalOf(generator.of, value);
  }
  if (generator instanceof RecordShape) return recordOf(generator, value);
  if (generator instanceof EnumShape) return variantOf(generator, value);
  if (generator instanceof List || generator instanceof ListShape) {
    return elementsOf(generator.of, value);
  }
  if (generator instanceof Dict) return mapOf(generator.keys, generator.values, value);
  if (generator instanceof MapShape) return mapOf(generator.key, generator.of, value);
  return typed(generator, value) ?? generic(value);
}

/** Returns the literal of a value of a generator whose values have one type, or undefined for another generator. */
function typed(generator: Decoder, value: unknown): Literal | undefined {
  if (
    (generator instanceof Integer || generator instanceof Int128Shape) &&
    typeof value === "bigint"
  ) {
    return scalarOf("int", value);
  }
  if (generator instanceof Float && typeof value === "number")
    return scalarOf("float", value);
  if (generator instanceof Bool && typeof value === "boolean")
    return scalarOf("bool", value);
  const text = generator instanceof Text || generator instanceof Matching;
  if (text && typeof value === "string") return scalarOf("string", value);
  const bytes = generator instanceof Bytes || generator instanceof IpShape;
  if (bytes && value instanceof Uint8Array) return engine.encode(value);
  return undefined;
}
