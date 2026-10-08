/**
 * Rendering a value into a failure message.
 *
 * A failure is read by someone who cannot see the value, so the text
 * has to carry it. `String(value)` turns an object into
 * `[object Object]`, which says nothing at all.
 */

/** How much of a value a failure message will carry. */
const MAX_LENGTH = 200;

/** How a rendering states a value. */
export interface Rendering {
  /** Whether a bigint is stated as its digits, as the counterexample of a property states it, and not with the suffix n. */
  readonly digits?: boolean;
}

/**
 * Answer a short, readable rendering of any value.
 *
 * Quotes strings so an empty one is visible, names a function by its
 * own name, and shows the entries of a `Map` or `Set` rather than
 * their bare type. A date or time value of Temporal shows its text.
 * Long values are cut, with the cut marked.
 *
 * @param value Anything an assertion was handed.
 * @param rendering How to state a bigint.
 * @returns The value as it should appear in a failure.
 */
export function show(value: unknown, rendering: Rendering = {}): string {
  return clip(render(value, 0, rendering.digits === true));
}

/** Cut an over-long rendering, marking that it was cut. */
function clip(text: string): string {
  return text.length <= MAX_LENGTH ? text : `${text.slice(0, MAX_LENGTH)}…`;
}

/** Render a value that is no object. */
function renderPrimitive(value: unknown, digits: boolean): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return digits ? String(value) : `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  return String(value);
}

/** Render one value, recursing to a bounded depth. */
function render(value: unknown, depth: number, digits: boolean): string {
  if (typeof value !== "object" || value === null)
    return renderPrimitive(value, digits);
  if (depth > 2) return "…";
  const inner = (v: unknown): string => render(v, depth + 1, digits);

  if (Array.isArray(value)) return `[${value.map(inner).join(", ")}]`;
  if (value instanceof Map) {
    const body = [...value].map(([k, v]) => `${inner(k)} => ${inner(v)}`).join(", ");
    return `Map(${value.size}) {${body}}`;
  }
  if (value instanceof Set)
    return `Set(${value.size}) {${[...value].map(inner).join(", ")}}`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (Object.prototype.toString.call(value).startsWith("[object Temporal."))
    return String(value);

  const body = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${inner(v)}`)
    .join(", ");
  return `{${body}}`;
}
