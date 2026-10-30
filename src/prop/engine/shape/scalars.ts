// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The builders of the scalar shapes: bool, int, float, char, string, bytes,
 * literal, uuid, ip-address and decimal.
 */

import { type Case, DECODE } from "../case.js";
import {
  FloatBounds,
  INT64_MAX,
  INT64_MIN,
  IntegerBounds,
  SequenceBounds,
} from "../choice.js";
import { DOUBLE, SINGLE, type Width } from "../float.js";
import {
  Bool,
  BYTE_VALUES,
  Bytes,
  Float,
  Generator,
  Integer,
  Matching,
  SampledFrom,
  Text,
} from "../generator.js";
import * as literal from "../literal.js";
import { piece } from "../pattern.js";
import { floorDiv } from "./calendar.js";
import { ShapeError, shown } from "./error.js";
import { Int128Shape } from "./pair.js";
import {
  alphabetOf,
  bounded,
  countParameter,
  DECIMAL_BASE,
  intParameter,
  type Node,
  rangeOf,
  sizesOf,
} from "./parameters.js";
import type { Reader } from "./reader.js";

/** The narrowest and the widest int shape, in bits. Every width between them is a power of two. */
const NARROWEST = 8n;
const WIDEST = 128n;

/** The IP versions, the bytes of an address of each, and the bytes of a UUID. */
const IPV4 = 4;
const IPV6 = 6;
const IPV4_BYTES = 4;
const IPV6_BYTES = 16;
const UUID_BYTES = 16;

/** The bytes of an address of each IP version. */
const ADDRESS_BYTES: ReadonlyMap<unknown, number> = new Map([
  [IPV4, IPV4_BYTES],
  [IPV6, IPV6_BYTES],
]);

/** The largest finite float of each width. */
const FLOAT_MAX: Readonly<Record<Width, number>> = {
  32: 3.402_823_466_385_288_6e38,
  64: Number.MAX_VALUE,
};

/** The text form of a decimal bound. */
const DECIMAL = /^-?\d+(?:\.\d+)?$/u;

/** Returns the generator of exactly count bytes. */
function fixedBytes(count: number): Bytes {
  return new Bytes(new SequenceBounds(BYTE_VALUES, count, count));
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
  if (text === undefined || text === null) {
    return undefined;
  }
  if (typeof text !== "string" || !DECIMAL.test(text)) {
    throw new ShapeError(`prop: ${where}.${key} is ${shown(text)}, not a decimal`);
  }
  const [whole, fraction = ""] = text.split(".") as [string, string?];
  const scale = DECIMAL_BASE ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * factor;
  const quotient = floorDiv(numerator, scale);
  return up && quotient * scale !== numerator ? quotient + 1n : quotient;
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

/** Returns the generator of a bool, true and false with even odds. */
export function boolShape(): Generator<unknown> {
  return new Bool({ num: 1n, den: 2n });
}

/** Returns the generator of a UUID's bytes. */
export function uuidShape(): Generator<unknown> {
  return fixedBytes(UUID_BYTES);
}

/** Returns the generator of an int of the stated width and signedness. */
export function intShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const width = intParameter(node, "width", where);
  const signed = node["signed"];
  const known = NARROWEST <= width && width <= WIDEST && (width & (width - 1n)) === 0n;
  if (!known || typeof signed !== "boolean") {
    throw new ShapeError(
      `prop: ${where} states width ${shown(node["width"])} and signed ${shown(signed)}`,
    );
  }
  const widest: readonly [bigint, bigint] = signed
    ? [-(1n << (width - 1n)), (1n << (width - 1n)) - 1n]
    : [0n, (1n << width) - 1n];
  const [lo, hi] = rangeOf(node, where, widest, literal.integer);
  if (width === WIDEST) {
    return new Int128Shape(lo, hi);
  }
  return new Integer(new IntegerBounds(lo, hi));
}

/** Returns the generator of a float of the stated width. */
export function floatShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const width = Number(intParameter(node, "width", where));
  if (width !== SINGLE && width !== DOUBLE) {
    throw new ShapeError(`prop: ${where}.width is ${width}, not 32 or 64`);
  }
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
export function charShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const [characters, size] = alphabetOf(node, where);
  return new Text(characters, new SequenceBounds(size, 1, 1));
}

/** Returns the generator of a string: over an alphabet, or matching a pattern. */
export function stringShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  if ("pattern" in node) {
    if (["alphabet", "min_size", "max_size"].some((key) => key in node)) {
      throw new ShapeError(`prop: ${where} states a pattern and an alphabet or a size`);
    }
    const text = node["pattern"];
    if (typeof text !== "string") {
      throw new ShapeError(`prop: ${where}.pattern is ${shown(text)}, not a pattern`);
    }
    return new Matching(piece(text));
  }
  const [characters, size] = alphabetOf(node, where);
  const sizes = sizesOf(node, where);
  return new Text(characters, new SequenceBounds(size, sizes.minSize, sizes.maxSize));
}

/** Returns the generator of a byte string. */
export function bytesShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const sizes = sizesOf(node, where);
  return new Bytes(new SequenceBounds(BYTE_VALUES, sizes.minSize, sizes.maxSize));
}

/** Returns the generator of one of the stated values. */
export function literalShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const values = node["values"];
  if (!Array.isArray(values) || values.length === 0) {
    throw new ShapeError(
      `prop: ${where}.values is ${shown(values)}, not a list of literals`,
    );
  }
  return new SampledFrom(values.map(literal.decode));
}

/** Returns the generator of an IP address of one version or either. */
export function ipShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const version = node["version"];
  if (version === undefined || version === null) {
    return new IpShape([fixedBytes(IPV4_BYTES), fixedBytes(IPV6_BYTES)]);
  }
  const count = ADDRESS_BYTES.get(version);
  if (count === undefined) {
    throw new ShapeError(`prop: ${where}.version is ${shown(version)}, not 4 or 6`);
  }
  return fixedBytes(count);
}

/** Returns the generator of a decimal's unscaled value at the stated scale. A bound with more digits than the scale rounds inward. */
export function decimalShape(
  _reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const scale = countParameter(node, "scale", where);
  if (scale === undefined) {
    throw new ShapeError(`prop: ${where} is a decimal and states no scale`);
  }
  const factor = DECIMAL_BASE ** BigInt(scale);
  const unscaled: Node = {
    min: decimalBound(node, "min", where, factor, true),
    max: decimalBound(node, "max", where, factor, false),
  };
  return new Integer(
    bounded(unscaled, where, [INT64_MIN, INT64_MAX], (v) => v as bigint),
  );
}
