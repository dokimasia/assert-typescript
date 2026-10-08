/**
 * The switch that turns call records on.
 *
 * `DOKIMI_ASSERT_RECORD=1` makes a test's seat write the call record of
 * every call it receives. Unset, empty or `0` writes none, and any other
 * value ends every call with a fault that names the variable.
 */

/** The environment variable that switches recording on. */
export const VARIABLE = "DOKIMI_ASSERT_RECORD";

/** The reading of the switch: whether it is on, or the fault of a value it does not define. */
export type Reading = { readonly on: boolean } | { readonly fault: Error };

/**
 * The key of the reading on `globalThis`. vitest can evaluate this module
 * once per test file in one process, and the reading is the process's.
 */
const KEY = Symbol.for("dokimi.assert.record.switch");

/** Reads the variable. */
function read(): Reading {
  const value = process.env[VARIABLE];
  if (value === undefined || value === "" || value === "0") return { on: false };
  if (value === "1") return { on: true };
  return {
    fault: new Error(`${VARIABLE}: ${JSON.stringify(value)} is neither 0 nor 1`),
  };
}

/**
 * Returns the reading of the switch, which the process reads once: a
 * change of the variable during a run has no effect.
 *
 * @returns On for `1`, off for an unset, empty or `0` variable, and the
 *   fault of any other value.
 */
export function reading(): Reading {
  const store = globalThis as { [KEY]?: Reading };
  store[KEY] ??= read();
  return store[KEY];
}
