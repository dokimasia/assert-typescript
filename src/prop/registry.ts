/**
 * The registry of a test file. It maps the name of a shape definition to
 * its generator, its values or its variants.
 *
 * TypeScript erases types, so each registration gives the name of the shape
 * definition that it registers, and a shape file refers to a registered name
 * with a ref. of returns the generator of a name, shapeOf its shape file, and
 * ofShape the generator of a shape file whose refs may be registered names.
 *
 * The definition scopes a registration to the test process, and vitest runs
 * each test file in a module graph of its own, so the registry is that of a
 * test file. Every registration precedes the first property: the first call
 * of forAll, fuzz or a property form closes the registry, and a later
 * registration throws. A registration of a name that a read has looked up
 * throws too, because the generators that the read returned would not see
 * it.
 */

import { type Literal, encode as literalOf } from "../record/literal.js";
import { type Converter, converterOf, IDENTITY } from "./convert.js";
import { type Generator, Mapped } from "./engine/generator.js";
import { decode } from "./engine/literal.js";
import { read, ShapeError } from "./engine/shape.js";
import { canonical } from "./engine/value.js";

/** What a registration states for a name: a generator, values, or variants. */
type Registration =
  | { readonly kind: "generator"; readonly generator: Generator<unknown> }
  | {
      readonly kind: "values";
      readonly values: readonly unknown[];
      readonly literals: readonly Literal[];
      readonly converter: Converter;
    }
  | {
      readonly kind: "variants";
      readonly variants: readonly (readonly [string, string | undefined])[];
    };

/** A shape as its JSON states it. */
type Node = Readonly<Record<string, unknown>>;

/** The registrations of the test file, by name. */
const REGISTRATIONS = new Map<string, Registration>();

/** The names that a read looked up while the registry was open. */
const CONSULTED = new Set<string>();

/** The generators that of returned, by name. */
const DERIVED = new Map<string, Generator<unknown>>();

/** Whether the first property has closed the registry. */
let closed = false;

/** The registered names of one shape file: the shapes that it defines, and the names of registered generators that it refers to. */
interface Document {
  readonly shapes: Map<string, Node>;
  readonly generators: Set<string>;
}

/** Throws unless the registry admits a registration of name by call. */
function admit(call: string, name: string): void {
  if (typeof name !== "string" || name === "")
    throw new RangeError(`prop: ${call} names no shape`);
  if (closed)
    throw new Error(
      `prop: ${call} follows the first property, which closed the registry`,
    );
  if (REGISTRATIONS.has(name))
    throw new Error(`prop: ${call} registers ${JSON.stringify(name)} a second time`);
  if (CONSULTED.has(name)) {
    throw new Error(
      `prop: ${call} follows a read of ${JSON.stringify(name)}, whose generators would not see it`,
    );
  }
}

/** Returns what the registry states for name, and records the read while the registry is open. */
function lookup(name: string): Registration | undefined {
  if (!closed) CONSULTED.add(name);
  return REGISTRATIONS.get(name);
}

/**
 * Makes generator the generator of the shape definition name in the test
 * file: of returns it, and a ref to name generates with it. generator may
 * lack a shape, as one built with map, filter or composite does, so shapeOf
 * throws for name and for a name whose shape refers to it.
 *
 * @param name - The name of the shape definition.
 * @param generator - The generator.
 * @throws Error after the first property of the test file, for a name that
 *   has a registration, and for a name that a read has looked up.
 */
export function register<T>(name: string, generator: Generator<T>): void {
  admit(`register(${JSON.stringify(name)})`, name);
  REGISTRATIONS.set(name, {
    kind: "generator",
    generator: generator as Generator<unknown>,
  });
}

/**
 * Makes the shape of name a literal over values, in the order given, so a
 * generator of name generates one of them and the first is the simplest.
 * Each value is stated as its typed literal: a number as an int or a float,
 * a string as a string, and a plain object as a record. shapeOf writes the
 * literals, and a generator of name returns the registered values
 * themselves.
 *
 * @param name - The name of the shape definition.
 * @param values - The values, at least one.
 * @throws Error as register does.
 * @throws RangeError for no value, a value that no typed literal states,
 *   and two values of one typed literal.
 */
export function registerValues<T>(name: string, ...values: readonly T[]): void {
  const call = `registerValues(${JSON.stringify(name)})`;
  admit(call, name);
  if (values.length === 0) throw new RangeError(`prop: ${call} states no value`);
  const literals = values.map((value, i) => {
    const stated = literalOf(value);
    if (stated === undefined)
      throw new RangeError(`prop: ${call}: value ${i} states no typed literal`);
    return stated;
  });
  const decoded = literals.map(decode);
  const keys = new Map<string, number>();
  for (const [i, value] of decoded.entries()) {
    const key = canonical(value);
    const earlier = keys.get(key);
    if (earlier !== undefined) {
      throw new RangeError(
        `prop: ${call}: values ${earlier} and ${i} state one typed literal`,
      );
    }
    keys.set(key, i);
  }
  for (const [i, value] of values.entries()) keys.set(canonical(value), i);
  const converter: Converter = {
    to: (value) => values[keys.get(canonical(value)) as number],
    back: (value) => {
      const index = keys.get(canonical(value));
      if (index === undefined) {
        throw new TypeError(
          `prop: ${canonical(value)} is none of the values of ${JSON.stringify(name)}`,
        );
      }
      return decoded[index];
    },
  };
  REGISTRATIONS.set(name, { kind: "values", values, literals, converter });
}

/**
 * Makes the shape of name an enum whose variants are the names of variants,
 * in the order that Object.entries lists them, so a generator of name
 * generates one of them and the first is the simplest. Each variant maps to
 * the registered name of its payload's shape, or to undefined for a variant
 * without a payload. A value of the enum is `{ name }`, and `{ name, payload }`
 * for a variant with a payload.
 *
 * @param name - The name of the shape definition.
 * @param variants - The registered name of each variant's payload, by the variant's name.
 * @throws Error as register does.
 * @throws RangeError for no variant, a variant without a name, and a
 *   payload's name that is no string.
 */
export function registerVariants(
  name: string,
  variants: Readonly<Record<string, string | undefined>>,
): void {
  const call = `registerVariants(${JSON.stringify(name)})`;
  admit(call, name);
  const entries = Object.entries(variants);
  if (entries.length === 0) throw new RangeError(`prop: ${call} states no variant`);
  for (const [variant, payload] of entries) {
    if (variant === "")
      throw new RangeError(`prop: ${call} states a variant without a name`);
    if (payload !== undefined && (typeof payload !== "string" || payload === "")) {
      throw new RangeError(
        `prop: ${call}: the variant ${JSON.stringify(variant)} names no payload shape`,
      );
    }
  }
  REGISTRATIONS.set(name, { kind: "variants", variants: entries });
}

/**
 * Returns the shapes of name and of every registered name that it refers
 * to, and the registered generators among those names.
 */
function documentOf(call: string, name: string): Document {
  const document: Document = { shapes: new Map(), generators: new Set() };
  const pending = [name];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (document.shapes.has(next) || document.generators.has(next)) continue;
    const registration = lookup(next);
    if (registration === undefined) {
      throw new RangeError(
        `prop: ${call}: ${JSON.stringify(next)} names no registration`,
      );
    }
    if (registration.kind === "generator") {
      document.generators.add(next);
    } else if (registration.kind === "values") {
      document.shapes.set(next, { shape: "literal", values: registration.literals });
    } else {
      const payloads = registration.variants.map(([variant, payload]) => {
        if (payload !== undefined) pending.push(payload);
        return [
          variant,
          payload === undefined ? null : { shape: "ref", name: payload },
        ];
      });
      document.shapes.set(next, { shape: "enum", variants: payloads });
    }
  }
  return document;
}

/** Returns the converters of the registered names of a document: the identity for a generator, and the registered values for values. */
function convertersOf(document: Document): Map<string, Converter> {
  const named = new Map<string, Converter>();
  for (const name of document.generators) named.set(name, IDENTITY);
  for (const name of document.shapes.keys()) {
    const registration = REGISTRATIONS.get(name) as Registration;
    if (registration.kind === "values") named.set(name, registration.converter);
  }
  return named;
}

/** Returns the generator of the engine's values of a shape file, with each value converted to and from its TypeScript value. */
function converted(
  document: Node,
  externals: ReadonlyMap<string, Generator<unknown>>,
  named: ReadonlyMap<string, Converter>,
): Generator<unknown> {
  const engine = read(document, externals);
  const converter = converterOf(document, named);
  return new Mapped(engine, converter.to, converter.back);
}

/** Returns the generator of a registered name, as of returns it. */
function derive(name: string): Generator<unknown> {
  const call = `of(${JSON.stringify(name)})`;
  const registration = lookup(name);
  if (registration === undefined)
    throw new RangeError(`prop: ${call} names no registration`);
  if (registration.kind === "generator") return registration.generator;
  const document = documentOf(call, name);
  const externals = new Map(
    [...document.generators].map((external) => {
      const stated = REGISTRATIONS.get(external) as Extract<
        Registration,
        { kind: "generator" }
      >;
      return [external, stated.generator] as const;
    }),
  );
  const root = { shape: "ref", name, definitions: Object.fromEntries(document.shapes) };
  return converted(root, externals, convertersOf(document));
}

/**
 * Returns the generator of the shape definition name: the generator that
 * register states, the registered values, or the variants of the enum, each
 * with the generator of its payload's registered name. A call reads the
 * registry once per name.
 *
 * @param name - The name of the shape definition.
 * @returns The generator.
 * @throws RangeError for a name that has no registration, and for a payload
 *   of a variant whose name has none.
 */
export function of<T>(name: string): Generator<T> {
  let generator = DERIVED.get(name);
  if (generator === undefined) {
    generator = derive(name);
    DERIVED.set(name, generator);
  }
  return generator as Generator<T>;
}

/** Returns a JSON value with the keys of each object sorted. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (typeof value !== "object" || value === null) return value;
  // The keys of an object are distinct, so no two compare equal.
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
  return Object.fromEntries(entries.map(([key, inner]) => [key, sortedKeys(inner)]));
}

/** Returns the names that the refs of node name, without following them. */
function refsOf(node: unknown, names: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) refsOf(item, names);
    return names;
  }
  if (typeof node !== "object" || node === null) return names;
  const shape = node as Node;
  if (shape["shape"] === "ref" && typeof shape["name"] === "string")
    names.add(shape["name"]);
  for (const [key, inner] of Object.entries(shape)) {
    if (key !== "values" && key !== "source") refsOf(inner, names);
  }
  return names;
}

/**
 * Returns the shape file of the shape definition name: its shape, the
 * definitions of the registered names that it refers to, and the field
 * source, which states the language and name. The keys are sorted and
 * indented by two spaces, and the text ends in a newline, so a golden file
 * of the shape changes only when the registration does.
 *
 * @param name - The name of the shape definition.
 * @returns The text.
 * @throws RangeError for a name that has no registration, and for a payload
 *   of a variant whose name has none.
 * @throws Error for a name that a registered generator generates, or whose
 *   shape refers to one, because a registered generator states no shape.
 */
export function shapeOf(name: string): string {
  const call = `shapeOf(${JSON.stringify(name)})`;
  const document = documentOf(call, name);
  const [generator] = document.generators;
  if (generator !== undefined) {
    throw new Error(
      `prop: ${call}: ${JSON.stringify(generator)} has a registered generator, which states no shape`,
    );
  }
  const root = document.shapes.get(name) as Node;
  const referred = refsOf([...document.shapes.values()], new Set());
  const definitions = [...document.shapes].filter(([defined]) => referred.has(defined));
  const file = {
    ...root,
    ...(definitions.length === 0
      ? {}
      : { definitions: Object.fromEntries(definitions) }),
    source: { language: "typescript", type: name },
  };
  return `${JSON.stringify(sortedKeys(file), null, 2)}\n`;
}

/**
 * Returns the generator of the shape file text, such as one that shapeOf or
 * another language wrote, each value converted to its TypeScript value: a
 * record to a plain object, an enum to `{ name }` or `{ name, payload }`,
 * and a date or a time to a Temporal value, as the module that converts
 * shapes states. A ref to a name that the file does not define generates
 * with the generator of that registered name, as of returns it.
 *
 * @param text - The shape file.
 * @returns The generator.
 * @throws ShapeError for text that is no JSON, and for a shape file that the
 *   definition's rules refuse, such as one with a ref to a name that neither
 *   the file defines nor the registry states.
 */
export function ofShape<T>(text: string): Generator<T> {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (err) {
    throw new ShapeError(`prop: the shape file is no JSON: ${(err as Error).message}`);
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new ShapeError(`prop: ${text.trim()} is not a shape`);
  }
  const root = document as Node;
  const definitions = root["definitions"];
  const defined = new Set(
    typeof definitions === "object" && definitions !== null
      ? Object.keys(definitions)
      : [],
  );
  const externals = new Map<string, Generator<unknown>>();
  for (const name of refsOf(root, new Set())) {
    if (!defined.has(name) && lookup(name) !== undefined) externals.set(name, of(name));
  }
  const named = new Map([...externals.keys()].map((name) => [name, IDENTITY] as const));
  return converted(root, externals, named) as Generator<T>;
}

/** Closes the registry, after which a registration throws. The first property of a test file calls it. */
export function close(): void {
  closed = true;
  CONSULTED.clear();
}
