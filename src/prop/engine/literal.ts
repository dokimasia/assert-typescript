/**
 * Typed literals of decoded values: the language-neutral form in which the
 * definition states a value of a generator or a shape.
 *
 * decode turns a literal into the value that a generator decodes, and
 * encode turns a decoded value into its one canonical literal:
 *
 * - null, bool, string, and float, which names NaN, Inf and -Inf.
 * - int, a bigint, as a JSON integer up to 2^53 − 1 in magnitude and as a
 *   decimal string beyond it.
 * - bytes, as lowercase hexadecimal.
 * - list: `of` and `value` for a non-empty list of one scalar type, and
 *   `items` for any other list.
 * - map: `entries`, a list of key and value literal pairs in order, decoded
 *   as Pairs. The form of `key`, `of` and a JSON object `value` decodes when
 *   its keys are strings.
 * - An absent list or map of a stated type, with a `value` of null, which
 *   decodes to undefined.
 * - record: `fields`, a list of name and value literal pairs, decoded as
 *   Fields.
 * - variant: `name`, and `payload` when the variant has one, decoded as a
 *   Variant.
 * - reference: `id` and `value`, decoded as its value.
 */

import { canonical, Fields, Pairs, Variant } from "./value.js";

/** A typed literal: a JSON object whose `type` names its form. */
export interface Literal {
  /** The literal's type. */
  readonly type: string;
  /** The other keys of the literal's form. */
  readonly [key: string]: unknown;
}

/** The largest integer magnitude that a JSON number states exactly in every language. */
const SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

/** The floats that JSON cannot state, by their names. */
const NON_FINITE: ReadonlyMap<string, number> = new Map([
  ["NaN", Number.NaN],
  ["Inf", Number.POSITIVE_INFINITY],
  ["-Inf", Number.NEGATIVE_INFINITY],
]);

/** The scalar types that a list's `of` and a map's `key` may name. */
const SCALARS = new Set(["bool", "int", "float", "string"]);

/** A literal that the encoding does not define, or one whose value lacks its type. */
export class LiteralError extends Error {
  /**
   * Returns the error of a literal that does not decode.
   *
   * @param message - What is wrong with the literal.
   */
  constructor(message: string) {
    super(message);
    this.name = "LiteralError";
  }
}

/** Returns the JSON text of a value, for an error's message. */
function shown(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/**
 * Returns an int stated as a JSON integer, or beyond 2^53 − 1 in magnitude
 * as a decimal string.
 *
 * @param value - The JSON value.
 * @returns The integer.
 * @throws LiteralError for any other value, and for a safe integer stated
 *   as a string.
 */
export function integer(value: unknown): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new LiteralError(`prop: ${value} is beyond 2^53 - 1; state it as a string`);
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?[0-9]+$/.test(value)) {
    const parsed = BigInt(value);
    const magnitude = parsed < 0n ? -parsed : parsed;
    if (magnitude <= SAFE_INTEGER || parsed.toString() !== value) {
      throw new LiteralError(`prop: ${shown(value)} is no canonical large integer`);
    }
    return parsed;
  }
  throw new LiteralError(`prop: ${shown(value)} is no integer`);
}

/**
 * Returns a float stated as a JSON number or as NaN, Inf or -Inf.
 *
 * @param value - The JSON value.
 * @returns The float.
 * @throws LiteralError for any other value.
 */
export function number(value: unknown): number {
  if (typeof value === "number") return value;
  const named = typeof value === "string" ? NON_FINITE.get(value) : undefined;
  if (named === undefined) throw new LiteralError(`prop: ${shown(value)} is no float`);
  return named;
}

/** Returns value as a scalar of the named type. */
function scalar(kind: unknown, value: unknown): unknown {
  if (kind === "bool" && typeof value === "boolean") return value;
  if (kind === "int") return integer(value);
  if (kind === "float") return number(value);
  if (kind === "string" && typeof value === "string") return value;
  throw new LiteralError(`prop: ${shown(value)} is no literal of type ${shown(kind)}`);
}

/** Returns bytes stated as lowercase hexadecimal. */
function bytesOf(value: unknown): Uint8Array {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})*$/.test(value)) {
    throw new LiteralError(`prop: ${shown(value)} is no lowercase hexadecimal`);
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
}

/** Reports whether literal states an absent container of a scalar type. */
function absent(literal: Literal): boolean {
  if (!("value" in literal) || literal["value"] !== null) return false;
  if (!SCALARS.has(literal["of"] as string)) {
    throw new LiteralError(
      `prop: ${shown(literal)} states no type for its absent value`,
    );
  }
  return true;
}

/** Returns a list stated by of and value, or by items, or undefined for an absent one. */
function listOf(literal: Literal): unknown[] | undefined {
  if ("items" in literal) {
    const items = literal["items"];
    if (!Array.isArray(items))
      throw new LiteralError(`prop: items is ${shown(items)}, not a list`);
    return items.map(decode);
  }
  if (absent(literal)) return undefined;
  const values = literal["value"];
  if (!Array.isArray(values))
    throw new LiteralError(`prop: ${shown(literal)} states no list`);
  return values.map((v) => scalar(literal["of"], v));
}

/** Returns a map stated by entries or by string keys, or undefined for an absent one. */
function mapOf(literal: Literal): Pairs | undefined {
  if ("entries" in literal) {
    const entries = literal["entries"];
    if (
      !Array.isArray(entries) ||
      !entries.every((e) => Array.isArray(e) && e.length === 2)
    ) {
      throw new LiteralError(
        `prop: entries is ${shown(entries)}, not key and value pairs`,
      );
    }
    return new Pairs(entries.map(([k, v]) => [decode(k), decode(v)] as const));
  }
  if (literal["key"] !== "string") {
    throw new LiteralError(`prop: ${shown(literal)} is no map with string keys`);
  }
  if (absent(literal)) return undefined;
  const values = literal["value"];
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new LiteralError(`prop: ${shown(literal)} is no map with string keys`);
  }
  return new Pairs(
    Object.entries(values).map(([k, v]) => [k, scalar(literal["of"], v)] as const),
  );
}

/** Returns a record stated by its name and value pairs. */
function recordOf(fields: unknown): Fields {
  const pairs =
    Array.isArray(fields) &&
    fields.every(
      (f) =>
        Array.isArray(f) && f.length === 2 && typeof f[0] === "string" && f[0] !== "",
    );
  if (!pairs)
    throw new LiteralError(
      `prop: fields is ${shown(fields)}, not name and value pairs`,
    );
  const names = (fields as [string, unknown][]).map(([name]) => name);
  if (new Set(names).size !== names.length) {
    throw new LiteralError(`prop: the record ${shown(names)} names a field twice`);
  }
  return new Fields(
    (fields as [string, unknown][]).map(([n, v]) => [n, decode(v)] as const),
  );
}

/** Returns a variant stated by its name, and its payload when it has one. */
function variantOf(literal: Literal): Variant {
  const name = literal["name"];
  if (typeof name !== "string" || name === "") {
    throw new LiteralError(`prop: ${shown(literal)} names no variant`);
  }
  return "payload" in literal
    ? new Variant(name, decode(literal["payload"]))
    : new Variant(name);
}

/** Returns the value that a reference refers to. */
function referenceOf(literal: Literal): unknown {
  const id = literal["id"];
  if (typeof id !== "string" || id === "") {
    throw new LiteralError(`prop: ${shown(literal)} states no id`);
  }
  const value = literal["value"] as Literal | undefined;
  if (value?.type === "null") {
    throw new LiteralError(
      `prop: the reference ${shown(id)} refers to null, no object`,
    );
  }
  return decode(value);
}

/**
 * Returns the value that a typed literal states.
 *
 * @param literal - The literal, a JSON value.
 * @returns The value.
 * @throws LiteralError for a literal that the encoding does not define.
 */
export function decode(literal: unknown): unknown {
  if (typeof literal !== "object" || literal === null || Array.isArray(literal)) {
    throw new LiteralError(`prop: ${shown(literal)} is no typed literal`);
  }
  const form = literal as Literal;
  switch (form.type) {
    case "null":
      return undefined;
    case "bytes":
      return bytesOf(form["value"]);
    case "list":
      return listOf(form);
    case "map":
      return mapOf(form);
    case "record":
      return recordOf(form["fields"]);
    case "variant":
      return variantOf(form);
    case "reference":
      return referenceOf(form);
    default:
      return scalar(form.type, form["value"]);
  }
}

/** Returns the scalar type that a value encodes as, or undefined for any other value. */
function scalarKind(value: unknown): string | undefined {
  switch (typeof value) {
    case "boolean":
      return "bool";
    case "bigint":
      return "int";
    case "number":
      return "float";
    case "string":
      return "string";
    default:
      return undefined;
  }
}

/**
 * Returns a scalar's JSON form: the non-finite floats by name, and the
 * integers beyond 2^53 − 1 in magnitude as decimal strings.
 *
 * @param value - A boolean, a bigint, a number or a string.
 * @returns The JSON value.
 */
export function plain(value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return value > 0 ? "Inf" : "-Inf";
    return value;
  }
  if (typeof value === "bigint") {
    const magnitude = value < 0n ? -value : value;
    return magnitude > SAFE_INTEGER ? value.toString() : Number(value);
  }
  return value;
}

/**
 * Returns the canonical typed literal of a decoded value.
 *
 * @param value - A value that a generator decodes.
 * @returns The literal.
 * @throws TypeError for a value that no generator decodes.
 */
export function encode(value: unknown): Literal {
  if (value === undefined || value === null) return { type: "null" };
  if (value instanceof Uint8Array) {
    return { type: "bytes", value: Buffer.from(value).toString("hex") };
  }
  if (Array.isArray(value)) {
    const kinds = new Set(value.map(scalarKind));
    const [kind] = kinds;
    if (value.length > 0 && kinds.size === 1 && kind !== undefined) {
      return { type: "list", of: kind, value: value.map(plain) };
    }
    return { type: "list", items: value.map(encode) };
  }
  if (value instanceof Pairs) {
    return {
      type: "map",
      entries: value.items.map(([k, v]) => [encode(k), encode(v)]),
    };
  }
  if (value instanceof Fields) {
    return { type: "record", fields: value.fields.map(([n, v]) => [n, encode(v)]) };
  }
  if (value instanceof Variant) {
    return value.hasPayload
      ? { type: "variant", name: value.name, payload: encode(value.payload) }
      : { type: "variant", name: value.name };
  }
  const kind = scalarKind(value);
  if (kind === undefined)
    throw new TypeError(`prop: ${canonical(value)} is no decoded value`);
  return { type: kind, value: plain(value) };
}
