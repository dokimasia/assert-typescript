/**
 * The table of strict mode: each matcher of the runners that checks what
 * a standard assertion checks, with the assertion to call instead.
 *
 * A runner's matcher overlaps when a standard assertion checks the same
 * property of the same arguments. `toBe`, `toMatchObject`, the snapshot
 * matchers and the spy matchers have no counterpart, so strict mode
 * leaves them alone.
 */

import type { Outcome, State } from "./matchers.js";

/** The assertion to call instead of a refused matcher, and the one to call instead of it under `.not`. */
export interface Instead {
  /** The assertion to call. */
  readonly use: string;
  /** The assertion to call under `.not`, or undefined when the standard has no negative. */
  readonly not: string | undefined;
}

/** The refused matchers, by name. */
export const STRICT: Readonly<Record<string, Instead>> = {
  toEqual: { use: "isEqualTo", not: "isNotEqualTo" },
  toStrictEqual: { use: "isEqualTo", not: "isNotEqualTo" },
  toContain: { use: "doesContain", not: "doesNotContain" },
  toContainEqual: { use: "doesContain", not: "doesNotContain" },
  toHaveLength: { use: "hasLength", not: undefined },
  toMatch: { use: "doesMatch", not: undefined },
  toBeCloseTo: { use: "isCloseTo", not: undefined },
  toThrow: { use: "doesThrow", not: "doesNotThrow" },
  toThrowError: { use: "doesThrow", not: "doesNotThrow" },
};

/**
 * Returns the matcher that refuses the matcher name in strict mode. It
 * fails with and without `.not`, and its message gives the assertion to
 * call.
 *
 * @param name - The name of the refused matcher, a key of {@link STRICT}.
 * @returns The refusal.
 */
export function refusal(name: string): (this: State) => Outcome {
  const instead = STRICT[name] as Instead;
  return function (this: State) {
    const negated = this.isNot === true;
    const called = negated ? `not.${name}` : name;
    const use = negated ? instead.not : instead.use;
    const message =
      use === undefined
        ? `${called} is refused in strict mode, and the standard has no negative of ${instead.use}.`
        : `${called} is refused in strict mode. Call ${use} instead.`;
    return { pass: negated, message: () => message, meta: {} };
  };
}
