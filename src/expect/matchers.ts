/**
 * The matchers of the standard's assertions on the expect chain of vitest
 * and of jest.
 *
 * A matcher runs the function form of its assertion against a seat, and
 * returns the verdict as both runners read a matcher of `expect.extend`.
 * The value given to `expect` is the assertion's subject, and the other
 * arguments follow in the order of the function form. The function form
 * of most assertions takes the subject first, and {@link SUBJECTS} states
 * the place of the subject in the others.
 *
 * A matcher called under `.not` fails, and its message gives the negative
 * to call. The verdict of a matcher whose test ended before the matcher
 * settled is a pass, because the guard of its runner reported the call
 * then.
 */

import * as check from "../check.js";
import type { Failure } from "../failure.js";
import type { Recorder } from "../seat.js";
import type { Call } from "./guard.js";

/** The part of a runner's matcher state that a matcher reads. */
export interface State {
  /** Whether the test called the matcher under `.not`. */
  readonly isNot?: boolean | undefined;
}

/** What a matcher returns to its runner. */
export interface Outcome {
  /** Whether the assertion passed. */
  readonly pass: boolean;
  /** Returns the sentence of the failure, as the function form renders it. */
  readonly message: () => string;
  /** The observed value, for a failure whose record has a got and a want. */
  readonly actual?: unknown;
  /** The required value, for a failure whose record has a got and a want. */
  readonly expected?: unknown;
  /** The failure record, which a reporter reads. */
  readonly meta: { readonly failure?: Failure };
}

/** A matcher, as `expect.extend` takes one. */
export type Matcher = (
  this: State,
  received: unknown,
  ...args: unknown[]
) => Outcome | Promise<Outcome>;

/** What the adapter of a runner gives the matchers. */
export interface Runner {
  /** Returns the seat that one call of a matcher reports to. */
  readonly seat: () => Recorder;
  /**
   * Starts the guard of a call of an asynchronous matcher, or returns
   * undefined for a call that no test makes.
   */
  readonly start: (state: State, name: string) => Call | undefined;
}

/** The function form of each assertion, by its TypeScript name. */
const FORMS = check as unknown as Readonly<
  Record<string, (seat: Recorder, ...args: unknown[]) => unknown>
>;

/** The TypeScript names of the assertions, which name the matchers. */
export const NAMES: readonly string[] = Object.keys(check).sort();

/**
 * The place of the subject among the arguments that the function form
 * takes after the seat, for each assertion whose function form does not
 * take it first. The function form of noTaskLeaks takes no subject. Its
 * matcher runs the subject between the start of the function form and the
 * call of the function that the function form returns.
 */
export const SUBJECTS: Readonly<Record<string, number>> = {
  completesWithin: 1,
  doesReject: 1,
  eventually: 2,
  eventuallyTrue: 1,
  failsAfterClose: 1,
  isNotPure: 1,
  isPoisoned: 1,
  isPure: 1,
};

/** The negative of each assertion that has one. Each pair applies in both directions. */
export const NEGATIVES: ReadonlyMap<string, string> = new Map(
  [
    ["isEqualTo", "isNotEqualTo"],
    ["doesContain", "doesNotContain"],
    ["isNil", "isNotNil"],
    ["isEmpty", "isNotEmpty"],
    ["isTrue", "isFalse"],
    ["noError", "hasError"],
    ["errorIs", "errorIsNot"],
    ["doesThrow", "doesNotThrow"],
    ["isPure", "isNotPure"],
  ].flatMap(([a, b]) => [
    [a as string, b as string],
    [b as string, a as string],
  ]),
);

/**
 * The assertions whose function form returns a value that the subject
 * supplied, which can be a promise, and not a promise of the verdict.
 */
const VALUED = new Set(["doesThrow", "errorAs"]);

/** The outcome of a call that passed. */
const PASSED: Outcome = { pass: true, message: () => "the assertion passed", meta: {} };

/** Runs scope between the start of the function form of noTaskLeaks and the call of its result. */
async function scoped(seat: Recorder, scope: unknown, msg: unknown): Promise<void> {
  const done = check.noTaskLeaks(seat, msg as string);
  await (scope as () => unknown)();
  done();
}

/** Runs the function form of name on seat, with received in the place of the subject. */
function invoke(
  name: string,
  seat: Recorder,
  received: unknown,
  args: readonly unknown[],
): unknown {
  if (name === "noTaskLeaks") return scoped(seat, received, args[0]);
  const at = SUBJECTS[name] ?? 0;
  const form = FORMS[name] as (seat: Recorder, ...args: unknown[]) => unknown;
  return form(seat, ...args.slice(0, at), received, ...args.slice(at));
}

/** Returns the outcome of the calls that seat received. Every failure of an assertion of the root namespace has a record. */
function outcomeOf(seat: Recorder): Outcome {
  if (!seat.failed) return PASSED;
  const failure = seat.failures[0] as Failure;
  const message = seat.message;
  const values =
    Object.hasOwn(failure.detail, "want") && Object.hasOwn(failure.detail, "got")
      ? { actual: failure.got, expected: failure.want }
      : {};
  return { pass: false, message: () => message, ...values, meta: { failure } };
}

/** Returns the outcome of a call of name under `.not`, which fails with the negative to call. */
function refusal(name: string): Outcome {
  const negative = NEGATIVES.get(name);
  const message =
    negative === undefined
      ? `${name} does not take .not, and the standard has no negative of it.`
      : `${name} does not take .not. Call ${negative} instead.`;
  return { pass: true, message: () => message, meta: {} };
}

/** Returns the outcome of a call that settled, and settles its guard. */
function settled(call: Call | undefined, seat: Recorder): Outcome {
  const outcome = outcomeOf(seat);
  call?.settle(!outcome.pass);
  return call?.abandoned === true ? PASSED : outcome;
}

/** Returns the matcher of the assertion name. */
function matcherOf(name: string, runner: Runner): Matcher {
  return function (this: State, received: unknown, ...args: unknown[]) {
    if (this.isNot) return refusal(name);
    const seat = runner.seat();
    const result = invoke(name, seat, received, args);
    if (VALUED.has(name) || !(result instanceof Promise)) return outcomeOf(seat);
    const call = runner.start(this, name);
    return result.then(
      () => settled(call, seat),
      (err: unknown) => {
        call?.settle(true);
        throw err;
      },
    );
  };
}

/**
 * Returns the matchers of every assertion, by name, for the runner that
 * runner states.
 *
 * @param runner - The seat of each call, and the guard of the runner.
 * @returns The matchers, as `expect.extend` takes them.
 */
export function matchers(runner: Runner): Record<string, Matcher> {
  return Object.fromEntries(NAMES.map((name) => [name, matcherOf(name, runner)]));
}
