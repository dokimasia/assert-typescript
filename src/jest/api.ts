/**
 * The jest adapter: the standard's assertions on jest's `expect`, and
 * `expect.soft`.
 *
 * {@link register} adds a matcher for each assertion to jest's `expect`
 * through `expect.extend`, so jest's `resolves`, `rejects`,
 * `expect.assertions` and reporters apply to them. It adds `expect.soft`,
 * whose chain records each failure and returns, as vitest's does. It also
 * applies a mode to the jest matchers that check what a standard
 * assertion checks. An asynchronous matcher that a test does not await
 * fails the test after the test.
 *
 * The adapter imports `expect` and `afterEach` from `@jest/globals`. jest's
 * runtime returns the globals of the running test file for that
 * specifier, and resolves no package for it.
 */

import { afterEach, expect } from "@jest/globals";
import { type Call, Pending } from "../expect/guard.js";
import { matchers, NAMES, type Outcome, type State } from "../expect/matchers.js";
import { compare, open } from "../expect/shadow.js";
import { refusal, STRICT } from "../expect/strict.js";
import type { Overlap } from "../expect/types.js";
import { Recorder } from "../seat.js";

/**
 * The parts of jest's matcher state that identify the running test. jest
 * 30 states the identity of the test. jest 29 states the name of a
 * concurrent test apart from the name of the test that runs.
 */
interface Running {
  readonly currentTestIdentity?: () => object | undefined;
  readonly currentConcurrentTestName?: () => string | undefined;
  readonly currentTestName?: string | undefined;
  readonly testPath?: string | undefined;
  readonly isNot?: boolean | undefined;
}

/** A matcher of jest's registry. */
type Original = (this: Running, received: unknown, expected: unknown) => Outcome;

/** The symbol under which jest keeps its registry of matchers on the global object. */
const REGISTRY = Symbol.for("$$jest-matchers-object");

/** The property of jest's `expect` under which register records the mode that it applied. */
const APPLIED = Symbol.for("@dokimi/assert.overlap");

/** The matchers that jest's equality backs, which shadow mode compares. */
const EQUALITY = ["toEqual", "toStrictEqual"] as const;

/** The asynchronous matchers of each test that has not ended. */
const PENDING = new Pending();

/** Returns the identity of the test that state runs, or undefined outside a test. */
function testOf(state: Running): unknown {
  if (state.currentTestName === undefined) return undefined;
  return (
    state.currentTestIdentity?.() ??
    JSON.stringify([
      state.testPath,
      state.currentConcurrentTestName?.() ?? state.currentTestName,
    ])
  );
}

/** Starts the guard of a call of an asynchronous matcher in the test of state. */
function start(state: State, name: string): Call | undefined {
  const test = testOf(state as Running);
  return test === undefined ? undefined : PENDING.start(test, name);
}

/** Fails the test that ended for the first call that it did not await. */
function end(): void {
  const abandoned = PENDING.end(testOf(expect.getState())).find(
    (call) => call.abandoned,
  );
  if (abandoned !== undefined) throw abandoned.neverAwaited();
}

/** The matchers of the assertions, each of which reports to a recorder of its own. */
const MATCHERS = matchers({ seat: () => new Recorder(), start });

/** Keeps the failure of a matcher on a soft chain, and throws any other error. */
function keep(err: unknown): void {
  if (!(err instanceof Error) || !("matcherResult" in err)) throw err;
  expect.getState().suppressedErrors.push(err);
}

/** Returns chain as a soft chain: each of its matchers records its failure and returns. */
function softly(chain: object): object {
  return new Proxy(chain, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (key === "not" || key === "resolves" || key === "rejects") {
        return softly(value as object);
      }
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        try {
          const result: unknown = value(...args);
          return result instanceof Promise ? result.catch(keep) : result;
        } catch (err) {
          keep(err);
          return undefined;
        }
      };
    },
  });
}

/** jest's equality matchers, as its registry has them before shadow mode wraps them. */
type Originals = Readonly<Record<(typeof EQUALITY)[number], Original>>;

/**
 * Makes sure that the log can take lines, and returns jest's equality
 * matchers from its registry.
 *
 * @throws Error when the log cannot take lines, when the global object
 *   has no registry under jest's symbol, and when the registry has no
 *   equality matcher.
 */
function prepare(log: string): Originals {
  open(log);
  const held = (globalThis as Record<PropertyKey, unknown>)[REGISTRY] as
    | { readonly matchers?: Record<string, unknown> }
    | undefined;
  const registry = held?.matchers;
  if (registry === undefined) {
    throw new Error("register: shadow mode cannot read jest's registry of matchers");
  }
  const missing = EQUALITY.find((matcher) => typeof registry[matcher] !== "function");
  if (missing !== undefined) {
    throw new Error(
      `register: shadow mode cannot read jest's ${missing} from its registry`,
    );
  }
  return {
    toEqual: registry["toEqual"] as Original,
    toStrictEqual: registry["toStrictEqual"] as Original,
  };
}

/** Wraps jest's equality matchers, so that each logs a call whose verdict the standard's equality would change. */
function shadow(log: string, originals: Originals): void {
  const wrappers = EQUALITY.map(
    (matcher) =>
      [
        matcher,
        function (this: Running, received: unknown, expected: unknown): Outcome {
          const result = originals[matcher].call(this, received, expected);
          const negated = this.isNot === true;
          compare(log, {
            runner: "jest",
            test: this.currentTestName ?? "",
            matcher,
            negated,
            received,
            expected,
            passed: result.pass !== negated,
          });
          return result;
        },
      ] as const,
  );
  expect.extend(Object.fromEntries(wrappers));
}

/**
 * Adds the standard's assertions to jest's `expect`, and adds
 * `expect.soft`.
 *
 * Call it from a file that `setupFilesAfterEnv` names. jest runs that file
 * in the environment of each test file, so `register` runs once for each
 * test file. A repeated call in one test file with the same mode
 * registers the same matchers again and changes nothing else.
 *
 * @param overlap - What happens to jest's overlapping matchers, and
 *   `{ mode: "allow" }` when omitted.
 * @throws Error when jest's `expect` already has a matcher under one of
 *   the assertion names, or a property named `soft`. The message contains
 *   the name.
 * @throws Error when an earlier call in this test file chose another
 *   mode.
 * @throws Error when shadow mode cannot append to its log, or cannot read
 *   jest's registry of matchers.
 * @example
 * // jest.setup.ts
 * import { register } from "@dokimi/assert/jest";
 *
 * register();
 */
export function register(overlap: Overlap = { mode: "allow" }): void {
  const holder = expect as unknown as Record<PropertyKey, unknown>;
  const applied = holder[APPLIED] as Overlap["mode"] | undefined;
  if (applied !== undefined && applied !== overlap.mode) {
    throw new Error(
      `register: an earlier call in this test file chose the mode ${applied}, and this call chooses ${overlap.mode}`,
    );
  }
  if (applied !== undefined) {
    expect.extend(MATCHERS);
    return;
  }
  const originals = overlap.mode === "shadow" ? prepare(overlap.log) : undefined;
  const chain = expect(undefined) as object;
  const taken = NAMES.find((name) => name in chain);
  if (taken !== undefined) {
    throw new Error(`register: jest's expect already has a matcher named ${taken}`);
  }
  if ("soft" in (expect as object)) {
    throw new Error("register: jest's expect already has a property named soft");
  }
  expect.extend(MATCHERS);
  Object.defineProperty(expect, "soft", {
    value: (actual: unknown) => softly(expect(actual) as object),
    configurable: true,
    writable: true,
  });
  afterEach(end);
  if (overlap.mode === "shadow") shadow(overlap.log, originals as Originals);
  if (overlap.mode === "strict") {
    const refused = Object.keys(STRICT).filter((name) => name in chain);
    expect.extend(Object.fromEntries(refused.map((name) => [name, refusal(name)])));
  }
  Object.defineProperty(expect, APPLIED, { value: overlap.mode, configurable: true });
}
