/**
 * The typed literal of a value, as a call record states it.
 *
 * A call record states each value of a failure's detail as a typed
 * literal of the definition's encoding, so a reader in any language
 * decodes it. A value that no typed literal states is an opaque literal,
 * which carries the value's text.
 */

import { show } from "../matcher/inspect.js";

/** A typed literal: a JSON object whose `type` names its form. */
export interface Literal {
  /** The literal's type, as the encoding names it. */
  readonly type: string;
  /** The other keys of the literal's form. */
  readonly [key: string]: unknown;
}

/**
 * The most levels of objects and arrays that a literal nests. A store
 * entry's root object, its counterexample and the draw take three of a
 * file's 64.
 */
const VALUE_DEPTH = 61;

/**
 * The most parts that the walk of one value visits: each value is one
 * part, and each UTF-8 byte of a string, a byte string or a field's name
 * is one more. The bound ends the walk of a value that contains itself.
 */
const MAX_PARTS = 65_536;

/** The largest integer that a JSON reader in JavaScript keeps exact. */
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** The scalar types of a list's `of`. */
type Scalar = "bool" | "int" | "float" | "string";

/** The literal of one value, as the walk builds it. */
interface Written {
  /** The literal. */
  readonly form: Literal;
  /** The scalar type of a bool, an integer, a float or a string. */
  readonly scalar?: Scalar;
  /** The JSON value of a scalar. */
  readonly plain?: unknown;
  /** The levels of objects and arrays that the literal nests. */
  readonly depth: number;
}

/** Returns the literal of a scalar of type `type` with the JSON value `plain`. */
function scalar(type: Scalar, plain: unknown): Written {
  return { form: { type, value: plain }, scalar: type, plain, depth: 1 };
}

/**
 * Returns the literal of a number. An integer within ±(2^53 − 1) other
 * than -0 is an int, and any other number a float, with NaN and the
 * infinities by their names.
 */
function numberOf(value: number): Written {
  if (Number.isSafeInteger(value) && !Object.is(value, -0)) return scalar("int", value);
  if (Number.isNaN(value)) return scalar("float", "NaN");
  if (value === Number.POSITIVE_INFINITY) return scalar("float", "Inf");
  if (value === Number.NEGATIVE_INFINITY) return scalar("float", "-Inf");
  return scalar("float", value);
}

/** Returns the literal of a bigint: a JSON number when safe, and its digits beyond. */
function bigintOf(value: bigint): Written {
  const safe = value >= -SAFE && value <= SAFE;
  return scalar("int", safe ? Number(value) : value.toString());
}

/** The constructors of the boxed primitives, whose literal is the literal of their value. */
const BOXES: readonly (abstract new (...args: never[]) => object)[] = [
  Number,
  String,
  Boolean,
  BigInt as unknown as abstract new (...args: never[]) => object,
];

/** Reports whether value is a boxed primitive, such as `Object(1)`. */
function boxed(value: object): boolean {
  return BOXES.some((box) => value instanceof box);
}

/**
 * Reports whether value states no typed literal: an error, a regular
 * expression, a promise, a cancellation handle, a boxed symbol and the
 * weak collections are values of their own, which a record states by
 * text.
 */
function opaqueKind(value: object): boolean {
  return (
    value instanceof Error ||
    value instanceof Symbol ||
    value instanceof RegExp ||
    value instanceof Promise ||
    value instanceof AbortSignal ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof WeakRef ||
    value instanceof DataView ||
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** Returns the hexadecimal text of bytes, in lowercase. */
function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** The scalar type that every one of items has, or undefined. */
function commonScalar(items: readonly Written[]): Scalar | undefined {
  const first = items[0]?.scalar;
  if (first === undefined) return undefined;
  return items.every((item) => item.scalar === first) ? first : undefined;
}

/** The walk of one value's parts. */
class Walk {
  /** The parts visited so far. */
  #parts = 0;
  /** The levels that the literals around the value being walked nest. */
  #level = 0;

  /** Counts n more parts, and reports whether the walk is within MAX_PARTS. */
  #spend(n: number): boolean {
    this.#parts += n;
    return this.#parts <= MAX_PARTS;
  }

  /** Reports whether n more parts can be within MAX_PARTS. */
  #fits(n: number): boolean {
    return this.#parts + n <= MAX_PARTS;
  }

  /** Returns the literal of value, a part that nests levels deeper. */
  #nested(value: unknown, levels: number): Written | undefined {
    this.#level += levels;
    const written = this.literalOf(value);
    this.#level -= levels;
    return written;
  }

  /**
   * Returns the literal of value, or undefined when value has none, the
   * walk passes MAX_PARTS, or value is below more levels than any literal
   * nests.
   */
  literalOf(value: unknown): Written | undefined {
    if (!this.#spend(1) || this.#level > VALUE_DEPTH) return undefined;
    if (value === null || value === undefined)
      return { form: { type: "null" }, depth: 1 };
    switch (typeof value) {
      case "boolean":
        return scalar("bool", value);
      case "number":
        return numberOf(value);
      case "bigint":
        return bigintOf(value);
      case "string":
        return this.#text(value);
      case "object":
        return this.#objectOf(value);
      default:
        return undefined;
    }
  }

  /** Returns the literal of a string, and undefined for one that is no UTF-8 text. */
  #text(value: string): Written | undefined {
    if (!value.isWellFormed() || !this.#spend(Buffer.byteLength(value)))
      return undefined;
    return scalar("string", value);
  }

  /** Returns the literal of an object, by its kind. */
  #objectOf(value: object): Written | undefined {
    if (boxed(value))
      return this.literalOf((value as { valueOf(): unknown }).valueOf());
    if (opaqueKind(value)) return undefined;
    if (value instanceof Uint8Array) {
      if (!this.#spend(value.length)) return undefined;
      return { form: { type: "bytes", value: hex(value) }, depth: 1 };
    }
    if (ArrayBuffer.isView(value)) {
      return this.#listOf(Array.from(value as unknown as ArrayLike<unknown>));
    }
    if (Array.isArray(value)) return this.#listOf(value);
    if (value instanceof Set) return this.#listOf([...value]);
    if (value instanceof Map) return this.#mapOf([...value]);
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? undefined
        : this.#text(value.toISOString());
    }
    return this.#recordOf(value as Record<string, unknown>);
  }

  /**
   * Returns the literal of a list: the values of scalars of one type, and
   * the literal of each element otherwise.
   */
  #listOf(elements: readonly unknown[]): Written | undefined {
    if (!this.#fits(elements.length)) return undefined;
    const items: Written[] = [];
    // An index walk, so a hole of a sparse array is an absent element.
    for (let i = 0; i < elements.length; i += 1) {
      const item = this.#nested(elements[i], 2);
      if (item === undefined) return undefined;
      items.push(item);
    }
    const of = commonScalar(items);
    if (of !== undefined) {
      return { form: { type: "list", of, value: items.map((i) => i.plain) }, depth: 2 };
    }
    const deepest = Math.max(0, ...items.map((i) => i.depth));
    return {
      form: { type: "list", items: items.map((i) => i.form) },
      depth: 2 + deepest,
    };
  }

  /** Returns the literal of a map: its entries, in the order the map lists them. */
  #mapOf(entries: readonly (readonly [unknown, unknown])[]): Written | undefined {
    if (!this.#fits(2 * entries.length)) return undefined;
    const pairs: [Literal, Literal][] = [];
    let depth = 2;
    for (const [key, value] of entries) {
      const k = this.#nested(key, 3);
      if (k === undefined) return undefined;
      const v = this.#nested(value, 3);
      if (v === undefined) return undefined;
      pairs.push([k.form, v.form]);
      depth = Math.max(depth, 3 + k.depth, 3 + v.depth);
    }
    return { form: { type: "map", entries: pairs }, depth };
  }

  /** Returns the literal of an object: a record of its own enumerable fields, in order. */
  #recordOf(value: Record<string, unknown>): Written | undefined {
    const names = Object.keys(value);
    if (!this.#fits(names.length)) return undefined;
    const fields: [string, Literal][] = [];
    let depth = 2;
    for (const name of names) {
      if (!this.#spend(Buffer.byteLength(name))) return undefined;
      const field = this.#nested(value[name], 3);
      if (field === undefined) return undefined;
      fields.push([name, field.form]);
      depth = Math.max(depth, 3 + field.depth);
    }
    return { form: { type: "record", fields }, depth };
  }
}

/**
 * Returns the typed literal of value, or undefined when no typed literal
 * states it.
 *
 * - null and undefined are null.
 * - A boolean is a bool, and a string that is well-formed UTF-16 is a
 *   string.
 * - An integer within ±(2^53 − 1) other than -0 is an int, and any other
 *   number is a float, with NaN, `Inf` and `-Inf` by name.
 * - A bigint is an int, stated by its digits beyond ±(2^53 − 1).
 * - A boxed primitive is the literal of its value.
 * - A `Uint8Array` is bytes. Any other typed array, an array and a `Set`
 *   are a list, of scalar values where every element is a scalar of one
 *   type and of item literals otherwise.
 * - A `Map` is a map of its entries, in the order the map lists them.
 * - A valid `Date` is the string of its ISO 8601 text.
 * - Any other object, other than the opaque kinds, is a record of its own
 *   enumerable fields, in the order the object lists them.
 *
 * A function, a symbol, an error, a regular expression, a promise, an
 * `AbortSignal`, a weak collection and a `DataView` have no literal, and
 * neither has a value that contains one. Nor has a value whose literal
 * would nest more than 61 levels, or that has more than 65,536 parts.
 *
 * @param value - The value to state.
 * @returns The literal, or undefined.
 */
export function encode(value: unknown): Literal | undefined {
  const written = new Walk().literalOf(value);
  if (written === undefined || written.depth > VALUE_DEPTH) return undefined;
  return written.form;
}

/**
 * Returns the opaque literal of a value that no typed literal states.
 *
 * @param text - The value's text, as a failure's sentence prints it.
 * @returns The literal `{ type: "opaque", text }`.
 */
export function opaque(text: string): Literal {
  return { type: "opaque", text };
}

/**
 * Returns the literal of value as the detail of a call record states it:
 * its typed literal, or the opaque literal of its text.
 *
 * @param value - A value of a failure's detail.
 * @returns The literal.
 */
export function detail(value: unknown): Literal {
  return encode(value) ?? opaque(show(value));
}

/**
 * Returns the JSON text of a JSON value, on one line, with the keys of
 * each object in the order the object lists them.
 *
 * It writes -0 as `-0`, where `JSON.stringify` writes `0`, so a float's
 * sign survives the text.
 *
 * @param value - A JSON value: null, a boolean, a finite number, a
 *   string, an array or a plain object of JSON values.
 * @returns The text.
 * @throws TypeError for a number that is not finite and for a value that
 *   is no JSON value, which no caller in this library builds.
 */
export function json(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value))
        throw new TypeError(`record: ${value} is no JSON number`);
      return Object.is(value, -0) ? "-0" : JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(json).join(",")}]`;
      const fields = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${JSON.stringify(k)}:${json(v)}`);
      return `{${fields.join(",")}}`;
    }
    default:
      throw new TypeError(`record: a ${typeof value} is no JSON value`);
  }
}
