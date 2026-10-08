/**
 * The corpus form of choices, bounds and seeds.
 *
 * A vector writes a choice as a JSON integer, or as a decimal string beyond
 * 2^53 − 1 in magnitude; `{"float": …}` with a number or a float's name; or
 * `{"sequence": […]}`. It writes a seed as a decimal string, and the bounds
 * of a request as an object of their kind and parameters.
 */

import type { Bounds, Choice } from "../../prop/engine/choice.js";
import * as literal from "../../prop/engine/literal.js";

/**
 * Returns the corpus form of one choice.
 *
 * @param choice - The choice.
 * @returns Its JSON value.
 */
export function choiceLiteral(choice: Choice): unknown {
  switch (choice.kind) {
    case "integer":
      return literal.plain(choice.value);
    case "float":
      return { float: literal.plain(choice.value) };
    default:
      return { sequence: [...choice.value] };
  }
}

/**
 * Returns the choice that a corpus form states.
 *
 * @param written - The JSON value.
 * @returns The choice.
 * @throws Error for a form that is none of the three.
 */
export function parseChoice(written: unknown): Choice {
  if (typeof written === "object" && written !== null && !Array.isArray(written)) {
    const keys = Object.keys(written);
    const form = written as Readonly<Record<string, unknown>>;
    if (keys.length === 1 && keys[0] === "float") {
      return { kind: "float", value: literal.number(form["float"]) };
    }
    if (
      keys.length === 1 &&
      keys[0] === "sequence" &&
      Array.isArray(form["sequence"])
    ) {
      return {
        kind: "sequence",
        value: form["sequence"].map((e) => Number(literal.integer(e))),
      };
    }
    throw new Error(`prop: ${JSON.stringify(written)} is no choice`);
  }
  return { kind: "integer", value: literal.integer(written) };
}

/**
 * Returns the choices that a list of corpus forms states.
 *
 * @param written - The JSON value.
 * @returns The choices.
 * @throws Error for a value that is no list of choices.
 */
export function parseChoices(written: unknown): Choice[] {
  if (!Array.isArray(written))
    throw new Error(`prop: ${JSON.stringify(written)} is no list of choices`);
  return written.map(parseChoice);
}

/**
 * Returns a vector's seed, stated as a decimal string.
 *
 * @param seed - The JSON value.
 * @returns The seed.
 * @throws Error for a value that is no decimal string.
 */
export function seedOf(seed: unknown): bigint {
  if (typeof seed !== "string" || !/^[0-9]+$/.test(seed)) {
    throw new Error(`prop: the seed ${JSON.stringify(seed)} is no decimal string`);
  }
  return BigInt(seed);
}

/**
 * Returns the corpus form of a request's bounds.
 *
 * @param bounds - The bounds.
 * @returns Their JSON object.
 */
export function boundsLiteral(bounds: Bounds): Record<string, unknown> {
  switch (bounds.kind) {
    case "integer":
      return {
        kind: "integer",
        min: literal.plain(bounds.lo),
        max: literal.plain(bounds.hi),
      };
    case "float":
      return {
        kind: "float",
        min: literal.plain(bounds.lo),
        max: literal.plain(bounds.hi),
        allow_nan: bounds.allowNan,
        width: bounds.width,
      };
    default:
      return {
        kind: "sequence",
        k: bounds.k,
        min_size: bounds.minSize,
        max_size: bounds.maxSize ?? null,
      };
  }
}
