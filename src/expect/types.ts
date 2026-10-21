/**
 * The types of the standard's assertions on the expect chain of vitest and
 * of jest.
 *
 * Each runner's declarations extend {@link StandardMatchers} with the type
 * parameters of that runner's `Matchers`. The value given to `expect` is
 * the assertion's subject, and the other arguments follow in the order of
 * the function form. A synchronous matcher returns `R`, which a runner
 * sets to a promise under `resolves` and `rejects`. An asynchronous
 * matcher returns a promise, which the test awaits.
 */

import type { ErrorClass } from "../matcher/errors.js";
import type { Option } from "../matcher/option.js";
import type { Count } from "../matcher/relation.js";

/** The element type of an array subject. */
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

/** The type of the first parameter of a function subject. */
type InputOf<T> = T extends (input: infer I, ...rest: never[]) => unknown ? I : never;

/** The type that a function subject returns, or that its promise resolves to. */
type ResultOf<T> = T extends (...args: never[]) => infer R ? Awaited<R> : never;

/**
 * The standard's assertions on a runner's chain. `R` is what a
 * synchronous matcher returns on that chain, and `T` is the type of the
 * value given to `expect`. Under `resolves`, vitest 4 keeps a promise as
 * `T` and vitest 5 and jest unwrap it, so `want` takes `T` or what `T`
 * resolves to.
 */
export interface StandardMatchers<R, T> {
  isEqualTo: (want: T | Awaited<T>, msg: string, ...options: Option[]) => R;
  isNotEqualTo: (want: T | Awaited<T>, msg: string, ...options: Option[]) => R;
  isTrue: (msg: string) => R;
  isFalse: (msg: string) => R;
  isNil: (msg: string) => R;
  isNotNil: (msg: string) => R;
  hasLength: (want: number, msg: string) => R;
  isEmpty: (msg: string) => R;
  isNotEmpty: (msg: string) => R;
  doesContain: (needle: unknown, msg: string, ...options: Option[]) => R;
  doesNotContain: (needle: unknown, msg: string, ...options: Option[]) => R;
  containsInOrder: (needles: readonly string[], msg: string) => R;
  hasPrefix: (prefix: string, msg: string) => R;
  hasSuffix: (suffix: string, msg: string) => R;
  doesMatch: (pattern: string, msg: string) => R;
  isCloseTo: (want: number, tolerance: number, msg: string) => R;
  inRange: (low: number, high: number, msg: string) => R;
  pairwise: (
    predicate: (
      earlier: ElementOf<Awaited<T>>,
      later: ElementOf<Awaited<T>>,
    ) => boolean,
    msg: string,
  ) => R;
  noError: (msg: string) => R;
  hasError: (msg: string) => R;
  errorIs: (target: unknown, msg: string) => R;
  errorIsNot: (target: unknown, msg: string) => R;
  errorAs: (want: ErrorClass<unknown>, msg: string) => R;
  doesThrow: (msg: string) => R;
  doesNotThrow: (msg: string) => R;
  isPermutation: (
    want: readonly ElementOf<Awaited<T>>[],
    msg: string,
    ...options: Option[]
  ) => R;
  doesReject: (msg: string) => Promise<void>;
  rejectsWith: (msg: string) => Promise<void>;
  honoursCancellation: (msg: string) => Promise<void>;
  honoursDeadline: (msg: string) => Promise<void>;
  completesWithin: (within: number, msg: string) => Promise<void>;
  nullHandleSafe: (msg: string) => Promise<void>;
  isPure: (observe: () => unknown, msg: string, ...options: Option[]) => Promise<void>;
  isNotPure: (
    observe: () => unknown,
    msg: string,
    ...options: Option[]
  ) => Promise<void>;
  eventually: (timeout: number, interval: number, msg: string) => Promise<void>;
  eventuallyTrue: (timeout: number, msg: string) => Promise<void>;
  noTaskLeaks: (msg: string) => Promise<void>;
  isIdempotent: (
    input: InputOf<T>,
    observe: () => unknown,
    msg: string,
    ...options: Option[]
  ) => Promise<void>;
  accumulates: (
    input: InputOf<T>,
    observe: () => Count | Promise<Count>,
    msg: string,
  ) => Promise<void>;
  isDeterministic: (
    input: InputOf<T>,
    msg: string,
    ...options: Option[]
  ) => Promise<void>;
  isCommutative: (
    a: InputOf<T>,
    b: InputOf<T>,
    msg: string,
    ...options: Option[]
  ) => Promise<void>;
  isAssociative: (
    a: InputOf<T>,
    b: InputOf<T>,
    c: InputOf<T>,
    msg: string,
    ...options: Option[]
  ) => Promise<void>;
  roundTrip: (
    inverse: (encoded: ResultOf<T>) => unknown,
    input: InputOf<T>,
    msg: string,
    ...options: Option[]
  ) => Promise<void>;
  hasStableOrder: (msg: string, ...options: Option[]) => Promise<void>;
  noDuplicates: (msg: string, ...options: Option[]) => Promise<void>;
  isMonotonic: (advance: () => unknown, steps: number, msg: string) => Promise<void>;
  isTotal: (domain: Iterable<InputOf<T>>, msg: string) => Promise<void>;
  failsAfterClose: (
    close: () => unknown,
    sentinel: unknown,
    msg: string,
  ) => Promise<void>;
  isPoisoned: (induce: () => unknown, msg: string) => Promise<void>;
}

/**
 * What `register` does to the runner's matchers that check what a
 * standard assertion checks.
 *
 * - `allow` leaves them as the runner defines them.
 * - `shadow` leaves every verdict as the runner gives it. It appends one
 *   JSON line to `log` for each `toEqual` or `toStrictEqual` call whose
 *   verdict the standard's equality would change.
 * - `strict` makes each of them fail, with a message that gives the
 *   standard's assertion to call.
 */
export type Overlap =
  | { readonly mode: "allow" }
  | { readonly mode: "shadow"; readonly log: string }
  | { readonly mode: "strict" };
