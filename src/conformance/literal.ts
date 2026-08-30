/**
 * Turning a corpus case's typed literals into native values.
 *
 * A case states its arguments in a language-neutral encoding, because
 * the same case has to run in every implementation. This is the half
 * of that contract TypeScript owns.
 */

/** One value, as a corpus case states it. */
export interface Literal {
  /** Which of the encoding's seven types this is. */
  readonly type: string;
  /** The value itself, for every type but null. */
  readonly value?: unknown;
  /** For a list or map, the type of what it holds. */
  readonly of?: string;
  /** For a map, the type of its keys. */
  readonly key?: string;
}

/**
 * The floats JSON has no syntax for.
 *
 * The keys are the encoding's own spelling, so they are data rather
 * than identifiers and camelCase would make them wrong.
 */
const NAMED_FLOATS: Record<string, number> = {
  NaN: Number.NaN,
  Inf: Number.POSITIVE_INFINITY,
  "-Inf": Number.NEGATIVE_INFINITY,
};

/** The scalar types a list or map may name as its element type. */
const SCALARS = new Set(["bool", "int", "float", "string"]);

/**
 * Answer the native value a literal states.
 *
 * @param literal One typed literal from a corpus case.
 * @returns The value, ready to hand to an assertion.
 * @throws When the literal names a type the encoding does not define,
 *   or a collection whose element type is missing or not a scalar. A
 *   case that cannot be decoded must stop the run rather than quietly
 *   becoming an empty one.
 */
export function decode(literal: Literal): unknown {
  switch (literal.type) {
    case "null":
      return null;
    case "bool":
    case "string":
      return literal.value;
    case "int":
      return literal.value;
    case "float":
      return typeof literal.value === "string" ? named(literal.value) : literal.value;
    case "list":
      return decodeList(literal);
    case "map":
      return decodeMap(literal);
    default:
      throw new Error(`unknown literal type: ${literal.type}`);
  }
}

/** Answer one of the three floats JSON cannot spell. */
function named(text: string): number {
  const value = NAMED_FLOATS[text];
  if (value === undefined) throw new Error(`unknown float: ${text}`);
  return value;
}

/**
 * Refuse a collection whose element type is missing or unknown.
 *
 * An empty collection would decode without ever reading `of`, so a
 * gap in the encoding would pass unnoticed exactly where there is
 * nothing else to catch it.
 */
function refuseUnknownElement(literal: Literal, which: "of" | "key"): string {
  const named = literal[which];
  if (named === undefined) {
    throw new Error(`a ${literal.type} states no ${which}`);
  }
  if (!SCALARS.has(named)) {
    throw new Error(`a ${literal.type} names ${which} ${named}, which is not a scalar`);
  }
  return named;
}

/** Decode a list, refusing one whose element type is unusable. */
function decodeList(literal: Literal): unknown[] | null {
  refuseUnknownElement(literal, "of");
  if (literal.value === null) return null;
  if (!Array.isArray(literal.value)) {
    throw new Error("a list states a value that is not an array");
  }
  return literal.value;
}

/** Decode a map into a Map, which keeps its keys' types. */
function decodeMap(literal: Literal): Map<unknown, unknown> | null {
  refuseUnknownElement(literal, "of");
  refuseUnknownElement(literal, "key");
  if (literal.value === null) return null;
  if (typeof literal.value !== "object" || Array.isArray(literal.value)) {
    throw new Error("a map states a value that is not an object");
  }
  return new Map(Object.entries(literal.value as Record<string, unknown>));
}
