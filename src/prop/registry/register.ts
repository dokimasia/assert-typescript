// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The registrations of a test file: a generator, values or variants under
 * the name of a shape definition. A registration follows no property and no
 * read of its name, and registers each name once.
 */

import { encode as literalOf } from "../../record/literal.js";
import type { Converter } from "../convert/converter.js";
import type { Generator } from "../engine/generator.js";
import { decode } from "../engine/literal.js";
import { canonical } from "../engine/value.js";
import { CONSULTED, isClosed, REGISTRATIONS } from "../registry.js";

/** Throws unless the registry admits a registration of name by call. */
function admit(call: string, name: string): void {
  if (typeof name !== "string" || name === "") {
    throw new RangeError(`prop: ${call} names no shape`);
  }
  if (isClosed()) {
    throw new Error(
      `prop: ${call} follows the first property, which closed the registry`,
    );
  }
  if (REGISTRATIONS.has(name)) {
    throw new Error(`prop: ${call} registers ${JSON.stringify(name)} a second time`);
  }
  if (CONSULTED.has(name)) {
    throw new Error(
      `prop: ${call} follows a read of ${JSON.stringify(name)}, whose generators would not see it`,
    );
  }
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
  if (values.length === 0) {
    throw new RangeError(`prop: ${call} states no value`);
  }
  const literals = values.map((value, i) => {
    const stated = literalOf(value);
    if (stated === undefined) {
      throw new RangeError(`prop: ${call}: value ${i} states no typed literal`);
    }
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
  for (const [i, value] of values.entries()) {
    keys.set(canonical(value), i);
  }
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
  if (entries.length === 0) {
    throw new RangeError(`prop: ${call} states no variant`);
  }
  for (const [variant, payload] of entries) {
    if (variant === "") {
      throw new RangeError(`prop: ${call} states a variant without a name`);
    }
    if (payload !== undefined && (typeof payload !== "string" || payload === "")) {
      throw new RangeError(
        `prop: ${call}: the variant ${JSON.stringify(variant)} names no payload shape`,
      );
    }
  }
  REGISTRATIONS.set(name, { kind: "variants", variants: entries });
}
