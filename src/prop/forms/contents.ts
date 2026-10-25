// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The property forms of the assertions about the contents of a value:
 * containment, text, numbers and order. Each runs its assertion on every
 * case of a run.
 */

import * as order from "../../matcher/order.js";
import { Mode, type Seat } from "../../matcher/seat.js";
import * as text from "../../matcher/text.js";
import * as value from "../../matcher/value.js";
import { FORMS, runForm } from "../form.js";
import type { FormOption } from "../option.js";

/** Every form's assertion stops the case at its failure, as forAll's body does. */
const MODE = Mode.Fatal;

/**
 * Runs doesContain on got(input) and needle for each generated input. It is
 * the form prop-contains, and takes the relaxations of contains.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the haystack for the input.
 * @param needle - The element, the key or the substring that it must contain.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.doesContain(seat, (xs: number[]) => withSentinel(xs), -1, "the sentinel is added",
 *   prop.using(prop.list(prop.integer(0, 9))));
 */
export function doesContain<T>(
  seat: Seat,
  got: (input: T) => unknown,
  needle: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.doesContain, msg, options, (c, [input], relaxations) =>
    value.contains(c, MODE, got(input as T), needle, msg, ...relaxations),
  );
}

/**
 * Runs doesNotContain on got(input) and needle for each generated input. It
 * is the form prop-not-contains, and takes the relaxations of not-contains.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the haystack for the input.
 * @param needle - The element, the key or the substring that it must not contain.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.doesNotContain(seat, (s: string) => escape(s), "<", "escaping removes every <",
 *   prop.using(prop.string()));
 */
export function doesNotContain<T>(
  seat: Seat,
  got: (input: T) => unknown,
  needle: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.doesNotContain, msg, options, (c, [input], relaxations) =>
    value.notContains(c, MODE, got(input as T), needle, msg, ...relaxations),
  );
}

/**
 * Runs containsInOrder on got(input) and needles for each generated input.
 * It is the form prop-contains-in-order.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the text for the input.
 * @param needles - The substrings that it must contain, in order.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.containsInOrder(seat, (name: string) => greet(name), ["Hello", "!"],
 *   "a greeting opens and closes", prop.using(prop.string()));
 */
export function containsInOrder<T>(
  seat: Seat,
  got: (input: T) => unknown,
  needles: readonly string[],
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.containsInOrder, msg, options, (c, [input]) =>
    text.containsInOrder(c, MODE, got(input as T), needles, msg),
  );
}

/**
 * Runs hasPrefix on got(input) and prefix for each generated input. It is
 * the form prop-has-prefix.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the text for the input.
 * @param prefix - The text that it must start with.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.hasPrefix(seat, (id: number) => key(id), "user:", "every key is namespaced",
 *   prop.using(prop.integer(0, 1000)));
 */
export function hasPrefix<T>(
  seat: Seat,
  got: (input: T) => unknown,
  prefix: string,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.hasPrefix, msg, options, (c, [input]) =>
    text.hasPrefix(c, MODE, got(input as T), prefix, msg),
  );
}

/**
 * Runs hasSuffix on got(input) and suffix for each generated input. It is
 * the form prop-has-suffix.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the text for the input.
 * @param suffix - The text that it must end with.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.hasSuffix(seat, (lines: string[]) => render(lines), "\n", "a file ends in a newline",
 *   prop.using(prop.list(prop.string())));
 */
export function hasSuffix<T>(
  seat: Seat,
  got: (input: T) => unknown,
  suffix: string,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.hasSuffix, msg, options, (c, [input]) =>
    text.hasSuffix(c, MODE, got(input as T), suffix, msg),
  );
}

/**
 * Runs doesMatch on got(input) and pattern for each generated input. It is
 * the form prop-matches.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the text for the input.
 * @param pattern - A pattern of the portable subset that the text must match.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.doesMatch(seat, (n: number) => format(n), "^-?[0-9]+$", "a number formats as digits",
 *   prop.using(prop.integer(-1000, 1000)));
 */
export function doesMatch<T>(
  seat: Seat,
  got: (input: T) => unknown,
  pattern: string,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.doesMatch, msg, options, (c, [input]) =>
    text.matches(c, MODE, got(input as T), pattern, msg),
  );
}

/**
 * Runs isCloseTo on got(input), want and tolerance for each generated input.
 * It is the form prop-close-to.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the number for the input.
 * @param want - The number that it must be close to.
 * @param tolerance - The largest difference allowed.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isCloseTo(seat, (x: number) => Math.sin(x) ** 2 + Math.cos(x) ** 2, 1, 1e-9,
 *   "sin² + cos² is 1", prop.using(prop.float(-10, 10)));
 */
export function isCloseTo<T>(
  seat: Seat,
  got: (input: T) => unknown,
  want: number,
  tolerance: number,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isCloseTo, msg, options, (c, [input]) =>
    value.closeTo(c, MODE, got(input as T), want, tolerance, msg),
  );
}

/**
 * Runs inRange on got(input), low and high for each generated input. It is
 * the form prop-in-range.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the number for the input.
 * @param low - The smallest value allowed.
 * @param high - The largest value allowed.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.inRange(seat, (o: Order) => total(o), 0, Number.MAX_SAFE_INTEGER,
 *   "a total is never negative", prop.using(prop.ofShape<Order>(orderShape)));
 */
export function inRange<T>(
  seat: Seat,
  got: (input: T) => unknown,
  low: number,
  high: number,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.inRange, msg, options, (c, [input]) =>
    value.inRange(c, MODE, got(input as T), low, high, msg),
  );
}

/**
 * Runs pairwise on got(input) and predicate for each generated input. It is
 * the form prop-pairwise.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the sequence for the input.
 * @param predicate - Called as predicate(earlier, later) for each adjacent pair.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.pairwise(seat, (xs: number[]) => sort(xs), (a, b) => a <= b, "sort orders",
 *   prop.using(prop.list(prop.integer(0, 9))));
 */
export function pairwise<T, E>(
  seat: Seat,
  got: (input: T) => readonly E[],
  predicate: (earlier: E, later: E) => boolean,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.pairwise, msg, options, (c, [input]) =>
    order.pairwise(c, MODE, got(input as T), predicate, msg),
  );
}
