/**
 * The generators of the property vectors, stated as data.
 *
 * A vector states a generator as a JSON object whose `gen` key names its
 * id. build turns that object into a generator of the engine, whose values
 * are the engine's decoded values. A `map` names the function of a subject
 * kind, a `filter` states its predicate as data, and `self` is one position
 * of the recursive value whose extension contains it.
 */

import * as alphabet from "../../prop/engine/alphabet.js";
import {
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../prop/engine/choice.js";
import { Sizes } from "../../prop/engine/collection.js";
import type { Rational } from "../../prop/engine/draw.js";
import {
  Bool,
  Bytes,
  Dict,
  Filter,
  Float,
  type Generator,
  Integer,
  Just,
  List,
  Mapped,
  Matching,
  OneOf,
  Optional,
  Permutation,
  Position,
  Recursive,
  SampledFrom,
  Text,
} from "../../prop/engine/generator.js";
import * as literal from "../../prop/engine/literal.js";
import { piece } from "../../prop/engine/pattern.js";
import { FUNCTIONS } from "./function.js";
import { predicate } from "./predicate.js";

/** A generator's JSON object. */
type Spec = Readonly<Record<string, unknown>>;

/** The values that one recursive value may draw from its base when the spec states no max_leaves. */
const DEFAULT_MAX_LEAVES = 100;

/** A spec that names no generator, or misstates a parameter or a literal. */
export class SpecError extends Error {
  /**
   * Returns the error of a spec.
   *
   * @param message - What is wrong with the spec.
   */
  constructor(message: string) {
    super(message);
    this.name = "SpecError";
  }
}

/** Returns the JSON text of a value, for an error's message. */
function shown(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** Returns the integer parameter key, as a typed literal states an int. */
function intOf(spec: Spec, key: string): bigint {
  if (!(key in spec)) throw new SpecError(`prop: ${shown(spec["gen"])} needs ${key}`);
  return literal.integer(spec[key]);
}

/** Returns the boolean parameter key, false when the spec does not state it. */
function boolOf(spec: Spec, key: string): boolean {
  const value = spec[key] ?? false;
  if (typeof value !== "boolean")
    throw new SpecError(`prop: ${key} is ${shown(value)}, not a boolean`);
  return value;
}

/** Returns min_size, 0 by default, and max_size, unbounded by default. */
function sizesOf(spec: Spec): Sizes {
  const lo = "min_size" in spec ? Number(intOf(spec, "min_size")) : 0;
  const stated = spec["max_size"];
  const hi =
    stated === undefined || stated === null
      ? undefined
      : Number(intOf(spec, "max_size"));
  return new Sizes(lo, hi);
}

/** Returns the greatest common divisor of two non-negative integers. */
function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? a : gcd(b, a % b);
}

/** Returns p, stated as [numerator, denominator], in lowest terms, or 1/2. */
function probabilityOf(spec: Spec): Rational {
  const value = spec["p"];
  if (value === undefined || value === null) return { num: 1n, den: 2n };
  const refusal = new SpecError(
    `prop: p is ${shown(value)}, want [numerator, denominator]`,
  );
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(Number.isSafeInteger)
  ) {
    throw refusal;
  }
  const num = BigInt(value[0] as number);
  const den = BigInt(value[1] as number);
  if (num < 0n || num > den || den < 1n) throw refusal;
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
}

/** Returns the typed literals of the values parameter, decoded. */
function valuesOf(spec: Spec): unknown[] {
  const values = spec["values"];
  if (!Array.isArray(values))
    throw new SpecError(`prop: values is ${shown(values)}, not a list`);
  return values.map(literal.decode);
}

/** Returns the generator of a string over the default alphabet or the stated characters. */
function textOf(spec: Spec): Text {
  const sizes = sizesOf(spec);
  const characters = spec["alphabet"];
  if (characters === undefined || characters === null) {
    return new Text(
      undefined,
      new SequenceBounds(alphabet.SIZE, sizes.minSize, sizes.maxSize),
    );
  }
  if (typeof characters !== "string" || characters === "") {
    throw new SpecError(
      `prop: alphabet is ${shown(characters)}, not a non-empty string`,
    );
  }
  const chars = [...characters];
  if (new Set(chars).size !== chars.length) {
    throw new SpecError(`prop: alphabet ${shown(characters)} repeats a character`);
  }
  if (chars.some((char) => alphabet.indexOf(char) === undefined)) {
    throw new SpecError(`prop: alphabet ${shown(characters)} has a lone surrogate`);
  }
  return new Text(
    chars,
    new SequenceBounds(chars.length, sizes.minSize, sizes.maxSize),
  );
}

/** Returns the pattern parameter. */
function patternOf(spec: Spec): string {
  const text = spec["pattern"];
  if (typeof text !== "string")
    throw new SpecError(`prop: pattern is ${shown(text)}, not a string`);
  return text;
}

/** Returns the generator of a recursive value, binding each self in its extension to it. */
function recursiveOf(spec: Spec): Recursive<unknown> {
  const maxLeaves =
    "max_leaves" in spec ? Number(intOf(spec, "max_leaves")) : DEFAULT_MAX_LEAVES;
  if (maxLeaves < 1) throw new SpecError(`prop: max_leaves is ${maxLeaves}, below 1`);
  return new Recursive(build(spec["base"]), maxLeaves, (self) =>
    build(spec["extend"], (self as Position<unknown>).owner),
  );
}

/** The builders of the generators whose specs contain no self, by id. */
const LEAVES: ReadonlyMap<string, (spec: Spec) => Generator<unknown>> = new Map<
  string,
  (spec: Spec) => Generator<unknown>
>([
  ["integer", (s) => new Integer(new IntegerBounds(intOf(s, "min"), intOf(s, "max")))],
  [
    "duration",
    (s) => new Integer(new IntegerBounds(intOf(s, "min"), intOf(s, "max")), "duration"),
  ],
  [
    "float",
    (s) =>
      new Float(
        new FloatBounds(
          literal.number(s["min"]),
          literal.number(s["max"]),
          boolOf(s, "allow_nan"),
          "width" in s ? (Number(intOf(s, "width")) as 32 | 64) : 64,
        ),
      ),
  ],
  ["boolean", (s) => new Bool(probabilityOf(s))],
  ["just", (s) => new Just(literal.decode(s["value"]))],
  [
    "sampled-from",
    (s) => {
      const values = valuesOf(s);
      if (values.length === 0)
        throw new SpecError("prop: sampled-from needs at least one value");
      return new SampledFrom(values);
    },
  ],
  ["string", textOf],
  ["string-matching", (s) => new Matching(piece(patternOf(s)))],
  [
    "bytes",
    (s) => new Bytes(new SequenceBounds(256, sizesOf(s).minSize, sizesOf(s).maxSize)),
  ],
  ["permutation", (s) => new Permutation(valuesOf(s))],
  ["recursive", recursiveOf],
]);

/** The builders of the generators that contain other generators, and so a self, by id. */
const COMPOSITES: ReadonlyMap<
  string,
  (spec: Spec, scope: Recursive<unknown> | undefined) => Generator<unknown>
> = new Map<
  string,
  (spec: Spec, scope: Recursive<unknown> | undefined) => Generator<unknown>
>([
  [
    "one-of",
    (s, scope) => {
      const of = s["of"];
      if (!Array.isArray(of) || of.length === 0) {
        throw new SpecError(
          `prop: one-of needs a list of generators, not ${shown(of)}`,
        );
      }
      return new OneOf(of.map((g) => build(g, scope)));
    },
  ],
  ["optional", (s, scope) => new Optional(build(s["of"], scope))],
  [
    "list",
    (s, scope) => new List(build(s["of"], scope), sizesOf(s), boolOf(s, "unique")),
  ],
  [
    "dict",
    (s, scope) =>
      new Dict(build(s["keys"], scope), build(s["values"], scope), sizesOf(s)),
  ],
  ["filter", (s, scope) => new Filter(build(s["of"], scope), predicate(s["keep"]))],
  [
    "map",
    (s, scope) => {
      const subject = s["subject"];
      const f = typeof subject === "string" ? FUNCTIONS.get(subject) : undefined;
      if (f === undefined)
        throw new SpecError(`prop: the subject ${shown(subject)} has no function`);
      return new Mapped(build(s["of"], scope), f);
    },
  ],
]);

/**
 * Returns the generator that a spec states.
 *
 * @param spec - The generator's JSON object.
 * @param scope - The recursive generator whose extension contains spec,
 *   which a `self` inside spec refers to.
 * @returns The generator.
 * @throws Error for a spec that names no generator, lacks a parameter, or
 *   states a parameter that the generator cannot take.
 */
export function build(spec: unknown, scope?: Recursive<unknown>): Generator<unknown> {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    throw new SpecError(`prop: ${shown(spec)} is no generator spec`);
  }
  const stated = spec as Spec;
  const kind = stated["gen"];
  if (kind === "self") {
    if (scope === undefined) {
      throw new SpecError(
        "prop: self appears outside the extension of a recursive generator",
      );
    }
    return new Position(scope);
  }
  const leaf = typeof kind === "string" ? LEAVES.get(kind) : undefined;
  if (leaf !== undefined) return leaf(stated);
  const composite = typeof kind === "string" ? COMPOSITES.get(kind) : undefined;
  if (composite !== undefined) return composite(stated, scope);
  throw new SpecError(`prop: ${shown(kind)} is no generator`);
}
