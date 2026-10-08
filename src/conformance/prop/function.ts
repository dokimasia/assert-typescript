/**
 * The functions of the definition's subject kinds that take one input.
 *
 * The map generator of the property vectors takes the function of a
 * subject kind. Each behaves as its summary in the definition's table of
 * subjects states, over the engine's decoded values: a bigint for an
 * integer, a number for a float, and undefined for null.
 */

/** Returns the elements of a list or the characters of a string after the first. */
function dropFirst(x: unknown): unknown {
  if (typeof x === "string") return [...x].slice(1).join("");
  return (x as readonly unknown[]).slice(1);
}

/** Returns the elements of a list in ascending order: numbers by value, and strings by code point. */
function sorted(x: unknown): unknown[] {
  return [...(x as readonly unknown[])].sort((a, b) => {
    if (typeof a === "string" && typeof b === "string") {
      const left = [...a].map((c) => c.codePointAt(0) as number);
      const right = [...b].map((c) => c.codePointAt(0) as number);
      for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
        if (left[i] !== right[i]) return (left[i] as number) - (right[i] as number);
      }
      return left.length - right.length;
    }
    return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
  });
}

/** The functions of the generated input, by subject kind. */
export const FUNCTIONS: ReadonlyMap<string, (x: unknown) => unknown> = new Map<
  string,
  (x: unknown) => unknown
>([
  ["identity", (x) => x],
  ["is-non-negative", (x) => (x as number) >= 0],
  ["returns-null", () => undefined],
  ["drops-the-first", dropFirst],
  ["prepends-zero", (x) => [0n, ...(x as readonly unknown[])]],
  ["sorts", sorted],
  ["wraps-in-a-and-b", (x) => `a${String(x)}b`],
]);
