/**
 * Rendering a value into a failure message.
 *
 * A failure is read by someone who cannot see the value, so the text
 * has to carry it. `String(value)` turns an object into
 * `[object Object]`, which says nothing at all.
 */

/** How much of a value a failure message will carry. */
const MAX_LENGTH = 200;

/**
 * Answer a short, readable rendering of any value.
 *
 * Quotes strings so an empty one is visible, names a function by its
 * own name, and shows the entries of a `Map` or `Set` rather than
 * their bare type. Long values are cut, with the cut marked.
 *
 * @param value Anything an assertion was handed.
 * @returns The value as it should appear in a failure.
 */
export function show(value: unknown): string {
  return clip(render(value, 0));
}

/** Cut an over-long rendering, marking that it was cut. */
function clip(text: string): string {
  return text.length <= MAX_LENGTH ? text : `${text.slice(0, MAX_LENGTH)}…`;
}

/** Render one value, recursing to a bounded depth. */
function render(value: unknown, depth: number): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  if (typeof value !== "object") return String(value);
  if (depth > 2) return "…";

  if (Array.isArray(value)) {
    return `[${value.map((v) => render(v, depth + 1)).join(", ")}]`;
  }
  if (value instanceof Map) {
    const body = [...value]
      .map(([k, v]) => `${render(k, depth + 1)} => ${render(v, depth + 1)}`)
      .join(", ");
    return `Map(${value.size}) {${body}}`;
  }
  if (value instanceof Set) {
    const body = [...value].map((v) => render(v, depth + 1)).join(", ");
    return `Set(${value.size}) {${body}}`;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;

  const body = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${render(v, depth + 1)}`)
    .join(", ");
  return `{${body}}`;
}
