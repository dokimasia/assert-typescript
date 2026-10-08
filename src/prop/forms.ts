/**
 * The property forms: each runs an assertion on every case of a run, as
 * forAll runs a body, and fails the test with one record of the form's id,
 * `prop-` and the assertion's id. The record's detail has the fields of
 * prop-for-all, and its failure is the assertion's record of the minimal
 * case.
 *
 * A form over a function takes a function of the generated input where its
 * assertion takes the value that it examines. A form of a relation
 * generates the arguments that the relation takes: the input, a and b for
 * isCommutative, and a, b and c for isAssociative.
 *
 * Every form takes the generator of its input through the option using,
 * the options of a run, the relaxations of its assertion where the
 * assertion takes any, and the cases that example and examples state. Each
 * form returns a promise of its verdict, so await the call.
 */

import type { Cancellable } from "../matcher/behaviour.js";
import * as behaviour from "../matcher/behaviour.js";
import type { ErrorClass } from "../matcher/errors.js";
import * as errors from "../matcher/errors.js";
import * as order from "../matcher/order.js";
import * as raising from "../matcher/raises.js";
import type { Count } from "../matcher/relation.js";
import * as relation from "../matcher/relation.js";
import { Mode, type Seat } from "../matcher/seat.js";
import * as value from "../matcher/value.js";
import { type Form, INPUT, PAIR, runForm, TRIPLE } from "./form.js";
import type { FormOption } from "./option.js";

/** Every form's assertion stops the case at its failure, as forAll's body does. */
const MODE = Mode.Fatal;

/** Returns the form of the assertion id, which TypeScript names name. */
function form(
  name: string,
  id: string,
  relaxed: boolean,
  labels: readonly string[] = INPUT,
): Form {
  return { op: `prop.${name}`, id: `prop-${id}`, relaxed, labels };
}

/** The forms, by their TypeScript name: the assertion's id, and whether the assertion takes relaxations. */
const FORMS = {
  equal: form("equal", "equal", true),
  notEqual: form("notEqual", "not-equal", true),
  isTrue: form("isTrue", "true", false),
  isFalse: form("isFalse", "false", false),
  isNil: form("isNil", "nil", false),
  isNotNil: form("isNotNil", "not-nil", false),
  length: form("length", "length", false),
  isEmpty: form("isEmpty", "empty", false),
  isNotEmpty: form("isNotEmpty", "not-empty", false),
  contains: form("contains", "contains", true),
  notContains: form("notContains", "not-contains", true),
  containsInOrder: form("containsInOrder", "contains-in-order", false),
  isPermutation: form("isPermutation", "permutation", true),
  hasPrefix: form("hasPrefix", "has-prefix", false),
  hasSuffix: form("hasSuffix", "has-suffix", false),
  matches: form("matches", "matches", false),
  closeTo: form("closeTo", "close-to", false),
  inRange: form("inRange", "in-range", false),
  pairwise: form("pairwise", "pairwise", false),
  noError: form("noError", "err-absent", false),
  hasError: form("hasError", "err-present", false),
  errorIs: form("errorIs", "err-is", false),
  errorIsNot: form("errorIsNot", "err-is-not", false),
  errorAs: form("errorAs", "err-as", false),
  throws: form("throws", "throws", false),
  doesNotThrow: form("doesNotThrow", "not-throws", false),
  isPure: form("isPure", "pure", true),
  isNotPure: form("isNotPure", "not-pure", true),
  nullHandleSafe: form("nullHandleSafe", "nil-context-safe", false),
  honoursCancellation: form("honoursCancellation", "honours-cancellation", false),
  honoursDeadline: form("honoursDeadline", "honours-deadline", false),
  isIdempotent: form("isIdempotent", "idempotent", true),
  accumulates: form("accumulates", "accumulates", false),
  isDeterministic: form("isDeterministic", "deterministic", true),
  isCommutative: form("isCommutative", "commutative", true, PAIR),
  isAssociative: form("isAssociative", "associative", true, TRIPLE),
  roundTrip: form("roundTrip", "round-trip", true),
} as const;

/** The ids of the property forms that this module exports, which their records state. */
export const FORM_IDS: readonly string[] = Object.values(FORMS).map(
  (stated) => stated.id,
);

/**
 * Runs equal on got(input) and want(input) for each generated input. It is
 * the form prop-equal, and takes the relaxations of equal.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that the code under test produces for the input.
 * @param want - Returns the value that it is supposed to produce.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.equal(seat, (xs: number[]) => sort(sort(xs)), (xs) => sort(xs),
 *   "sorting is idempotent", prop.using(prop.list(prop.integer(0, 9))));
 */
export function equal<T, U>(
  seat: Seat,
  got: (input: T) => U,
  want: (input: T) => U,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.equal, msg, options, (c, [input], relaxations) =>
    value.equal(c, MODE, got(input as T), want(input as T), msg, ...relaxations),
  );
}

/**
 * Runs notEqual on got(input) and want(input) for each generated input. It
 * is the form prop-not-equal, and takes the relaxations of not-equal.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that the code under test produces for the input.
 * @param want - Returns the value that it must not equal.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.notEqual(seat, (s: string) => hash(s), (s) => hash(`${s}!`),
 *   "a suffix changes the hash", prop.using(prop.string()));
 */
export function notEqual<T, U>(
  seat: Seat,
  got: (input: T) => U,
  want: (input: T) => U,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.notEqual, msg, options, (c, [input], relaxations) =>
    value.notEqual(c, MODE, got(input as T), want(input as T), msg, ...relaxations),
  );
}

/**
 * Runs isTrue on condition(input) for each generated input. It is the form
 * prop-true.
 *
 * @param seat - Where the failure is reported.
 * @param condition - Returns the condition that must be true for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isTrue(seat, (n: number) => abs(n) >= 0, "abs is never negative",
 *   prop.using(prop.integer(-100, 100)));
 */
export function isTrue<T>(
  seat: Seat,
  condition: (input: T) => boolean,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isTrue, msg, options, (c, [input]) =>
    value.isTrue(c, MODE, condition(input as T), msg),
  );
}

/**
 * Runs isFalse on condition(input) for each generated input. It is the form
 * prop-false.
 *
 * @param seat - Where the failure is reported.
 * @param condition - Returns the condition that must be false for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isFalse(seat, (s: string) => s.includes("\n"), "a slug has no line break",
 *   prop.using(prop.stringMatching("[a-z]+")));
 */
export function isFalse<T>(
  seat: Seat,
  condition: (input: T) => boolean,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isFalse, msg, options, (c, [input]) =>
    value.isFalse(c, MODE, condition(input as T), msg),
  );
}

/**
 * Runs isNil on got(input) for each generated input. It is the form
 * prop-nil.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must be null or undefined for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNil(seat, (k: string) => empty.get(k), "an empty map has no entry",
 *   prop.using(prop.string()));
 */
export function isNil<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNil, msg, options, (c, [input]) =>
    value.isNil(c, MODE, got(input as T), msg),
  );
}

/**
 * Runs isNotNil on got(input) for each generated input. It is the form
 * prop-not-nil.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must be neither null nor undefined for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNotNil(seat, (id: number) => store.get(id), "every seeded id is stored",
 *   prop.using(prop.integer(1, 10)));
 */
export function isNotNil<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNotNil, msg, options, (c, [input]) =>
    value.isNotNil(c, MODE, got(input as T), msg),
  );
}

/**
 * Runs length on got(input) and want for each generated input. It is the
 * form prop-length.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value whose length is checked for the input.
 * @param want - The length that it must have.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.length(seat, (b: Uint8Array) => digest(b), 32, "a digest has 32 bytes",
 *   prop.using(prop.bytes()));
 */
export function length<T>(
  seat: Seat,
  got: (input: T) => unknown,
  want: number,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.length, msg, options, (c, [input]) =>
    value.length(c, MODE, got(input as T), want, msg),
  );
}

/**
 * Runs isEmpty on got(input) for each generated input. It is the form
 * prop-empty.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must be empty for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isEmpty(seat, (xs: number[]) => diff(xs, xs), "a list differs from itself in nothing",
 *   prop.using(prop.list(prop.integer(0, 9))));
 */
export function isEmpty<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isEmpty, msg, options, (c, [input]) =>
    value.isEmpty(c, MODE, got(input as T), msg),
  );
}

/**
 * Runs isNotEmpty on got(input) for each generated input. It is the form
 * prop-not-empty.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the value that must not be empty for the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNotEmpty(seat, (s: string) => slug(s), "a slug is never empty",
 *   prop.using(prop.string({ minSize: 1 })));
 */
export function isNotEmpty<T>(
  seat: Seat,
  got: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNotEmpty, msg, options, (c, [input]) =>
    value.isNotEmpty(c, MODE, got(input as T), msg),
  );
}

/**
 * Runs contains on got(input) and needle for each generated input. It is
 * the form prop-contains, and takes the relaxations of contains.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the haystack for the input.
 * @param needle - The element, the key or the substring that it must contain.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.contains(seat, (xs: number[]) => withSentinel(xs), -1, "the sentinel is added",
 *   prop.using(prop.list(prop.integer(0, 9))));
 */
export function contains<T>(
  seat: Seat,
  got: (input: T) => unknown,
  needle: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.contains, msg, options, (c, [input], relaxations) =>
    value.contains(c, MODE, got(input as T), needle, msg, ...relaxations),
  );
}

/**
 * Runs notContains on got(input) and needle for each generated input. It
 * is the form prop-not-contains, and takes the relaxations of not-contains.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the haystack for the input.
 * @param needle - The element, the key or the substring that it must not contain.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.notContains(seat, (s: string) => escape(s), "<", "escaping removes every <",
 *   prop.using(prop.string()));
 */
export function notContains<T>(
  seat: Seat,
  got: (input: T) => unknown,
  needle: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.notContains, msg, options, (c, [input], relaxations) =>
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
    value.containsInOrder(c, MODE, got(input as T), needles, msg),
  );
}

/**
 * Runs isPermutation on got(input) and want(input) for each generated
 * input. It is the form prop-permutation, and takes the relaxations of
 * permutation.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the elements that the code under test produces for the input.
 * @param want - Returns the elements that they must be an ordering of.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isPermutation(seat, (xs: number[]) => shuffle(xs), (xs) => xs,
 *   "a shuffle keeps every element", prop.using(prop.list(prop.integer(0, 9))));
 */
export function isPermutation<T, E>(
  seat: Seat,
  got: (input: T) => readonly E[],
  want: (input: T) => readonly E[],
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isPermutation, msg, options, (c, [input], relaxations) =>
    relation.isPermutation(
      c,
      MODE,
      got(input as T),
      want(input as T),
      msg,
      ...relaxations,
    ),
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
    value.hasPrefix(c, MODE, got(input as T), prefix, msg),
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
    value.hasSuffix(c, MODE, got(input as T), suffix, msg),
  );
}

/**
 * Runs matches on got(input) and pattern for each generated input. It is
 * the form prop-matches.
 *
 * @param seat - Where the failure is reported.
 * @param got - Returns the text for the input.
 * @param pattern - A pattern of the portable subset that the text must match.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.matches(seat, (n: number) => format(n), "^-?[0-9]+$", "a number formats as digits",
 *   prop.using(prop.integer(-1000, 1000)));
 */
export function matches<T>(
  seat: Seat,
  got: (input: T) => unknown,
  pattern: string,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.matches, msg, options, (c, [input]) =>
    value.matches(c, MODE, got(input as T), pattern, msg),
  );
}

/**
 * Runs closeTo on got(input), want and tolerance for each generated input.
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
 * await prop.closeTo(seat, (x: number) => Math.sin(x) ** 2 + Math.cos(x) ** 2, 1, 1e-9,
 *   "sin² + cos² is 1", prop.using(prop.float(-10, 10)));
 */
export function closeTo<T>(
  seat: Seat,
  got: (input: T) => unknown,
  want: number,
  tolerance: number,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.closeTo, msg, options, (c, [input]) =>
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

/**
 * Runs noError on fn(input) for each generated input. It is the form
 * prop-err-absent.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input, or null when there is none.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.noError(seat, (s: string) => validate(s).error, "every slug validates",
 *   prop.using(prop.stringMatching("[a-z]+")));
 */
export function noError<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.noError, msg, options, (c, [input]) =>
    errors.noError(c, MODE, fn(input as T), msg),
  );
}

/**
 * Runs hasError on fn(input) for each generated input. It is the form
 * prop-err-present.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input, or null when there is none.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.hasError(seat, (s: string) => validate(` ${s}`).error, "a leading space is refused",
 *   prop.using(prop.string()));
 */
export function hasError<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.hasError, msg, options, (c, [input]) =>
    errors.hasError(c, MODE, fn(input as T), msg),
  );
}

/**
 * Runs errorIs on fn(input) and target for each generated input. It is the
 * form prop-err-is.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input.
 * @param target - The sentinel error or the class that it must match.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.errorIs(seat, (id: number) => closed.get(id).error, StoreClosed,
 *   "a closed store refuses every read", prop.using(prop.integer(0, 9)));
 */
export function errorIs<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  target: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.errorIs, msg, options, (c, [input]) =>
    errors.errorIs(c, MODE, fn(input as T), target, msg),
  );
}

/**
 * Runs errorIsNot on fn(input) and target for each generated input. It is
 * the form prop-err-is-not.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input.
 * @param target - The sentinel error or the class that it must not match.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.errorIsNot(seat, (s: string) => parse(s).error, Timeout,
 *   "parsing never times out", prop.using(prop.string()));
 */
export function errorIsNot<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  target: unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.errorIsNot, msg, options, (c, [input]) =>
    errors.errorIsNot(c, MODE, fn(input as T), target, msg),
  );
}

/**
 * Runs errorAs on fn(input) and want for each generated input. It is the
 * form prop-err-as.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Returns the error value for the input.
 * @param want - The error class that must be in the error's chain.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.errorAs(seat, (id: number) => taken.add(id).error, Conflict,
 *   "a taken id conflicts", prop.using(prop.integer(0, 9)));
 */
export function errorAs<T, E>(
  seat: Seat,
  fn: (input: T) => unknown,
  want: ErrorClass<E>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.errorAs, msg, options, (c, [input]) => {
    errors.errorAs(c, MODE, fn(input as T), want, msg);
  });
}

/**
 * Runs throws on a call of fn with the input for each generated input. It
 * is the form prop-throws.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with the input. It must be synchronous.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.throws(seat, (s: string) => parse(`{${s}`), "an open brace is refused",
 *   prop.using(prop.string()));
 */
export function throws<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.throws, msg, options, (c, [input]) => {
    raising.throws(c, MODE, () => fn(input as T), msg);
  });
}

/**
 * Runs doesNotThrow on a call of fn with the input for each generated
 * input. It is the form prop-not-throws.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.doesNotThrow(seat, (b: Uint8Array) => decode(b), "decode never throws",
 *   prop.using(prop.bytes()));
 */
export function doesNotThrow<T>(
  seat: Seat,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.doesNotThrow, msg, options, (c, [input]) =>
    raising.doesNotThrow(c, MODE, () => fn(input as T), msg),
  );
}

/**
 * Runs isPure on observe and a call of fn with the input for each generated
 * input. It is the form prop-pure, and takes the relaxations of pure.
 *
 * @param seat - Where the failure is reported.
 * @param observe - Returns a copy of the state that fn must not change.
 * @param fn - Called with the input. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isPure(seat, () => store.snapshot(), (id: number) => store.peek(id),
 *   "peek changes nothing", prop.using(prop.integer(0, 9)));
 */
export function isPure<T>(
  seat: Seat,
  observe: () => unknown,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isPure, msg, options, (c, [input], relaxations) =>
    behaviour.isPure(c, MODE, observe, () => fn(input as T), msg, ...relaxations),
  );
}

/**
 * Runs isNotPure on observe and a call of fn with the input for each
 * generated input. It is the form prop-not-pure, and takes the relaxations
 * of not-pure.
 *
 * @param seat - Where the failure is reported.
 * @param observe - Returns a copy of the state that fn must change.
 * @param fn - Called with the input. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isNotPure(seat, () => log.length, (line: string) => log.push(line),
 *   "every write grows the log", prop.using(prop.string()));
 */
export function isNotPure<T>(
  seat: Seat,
  observe: () => unknown,
  fn: (input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isNotPure, msg, options, (c, [input], relaxations) =>
    relation.isNotPure(c, MODE, observe, () => fn(input as T), msg, ...relaxations),
  );
}

/**
 * Runs nullHandleSafe on fn with the input for each generated input. It is
 * the form prop-nil-context-safe.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with undefined in place of a signal, and with the input.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.nullHandleSafe(seat, (signal, url: string) => client.fetch(url, { signal }),
 *   "a fetch needs no signal", prop.using(prop.string()));
 */
export function nullHandleSafe<T>(
  seat: Seat,
  fn: (signal: AbortSignal | undefined, input: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.nullHandleSafe, msg, options, (c, [input]) =>
    behaviour.nullHandleSafe(c, MODE, (signal) => fn(signal, input as T), msg),
  );
}

/**
 * Runs honoursCancellation on fn with the input for each generated input.
 * It is the form prop-honours-cancellation.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with an aborted signal and the input. It returns a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.honoursCancellation(seat, (signal, job: Job) => worker.run(job, signal),
 *   "every job stops when told", prop.using(prop.of<Job>("Job")));
 */
export function honoursCancellation<T>(
  seat: Seat,
  fn: (signal: AbortSignal, input: T) => Promise<unknown>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.honoursCancellation, msg, options, (c, [input]) => {
    const call: Cancellable = (signal) => fn(signal, input as T);
    return behaviour.honoursCancellation(c, MODE, call, msg);
  });
}

/**
 * Runs honoursDeadline on fn with the input for each generated input. It is
 * the form prop-honours-deadline.
 *
 * @param seat - Where the failure is reported.
 * @param fn - Called with an expired signal and the input. It returns a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.honoursDeadline(seat, (signal, url: string) => client.fetch(url, { signal }),
 *   "every fetch has a deadline", prop.using(prop.string()));
 */
export function honoursDeadline<T>(
  seat: Seat,
  fn: (signal: AbortSignal, input: T) => Promise<unknown>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.honoursDeadline, msg, options, (c, [input]) => {
    const call: Cancellable = (signal) => fn(signal, input as T);
    return behaviour.honoursDeadline(c, MODE, call, msg);
  });
}

/**
 * Runs isIdempotent on call, the generated input and observe for each case.
 * It is the form prop-idempotent, and takes the relaxations of idempotent.
 *
 * @param seat - Where the failure is reported.
 * @param call - Called with the input, twice. It may return a promise.
 * @param observe - Returns a copy of the state after each call.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isIdempotent(seat, (id: number) => cart.remove(id), () => cart.items(),
 *   "a second remove changes nothing", prop.using(prop.integer(0, 9)));
 */
export function isIdempotent<I>(
  seat: Seat,
  call: (input: I) => unknown,
  observe: () => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isIdempotent, msg, options, (c, [input], relaxations) =>
    relation.isIdempotent(c, MODE, call, input as I, observe, msg, ...relaxations),
  );
}

/**
 * Runs accumulates on call, the generated input and observe for each case.
 * It is the form prop-accumulates.
 *
 * @param seat - Where the failure is reported.
 * @param call - Called with the input, twice. It may return a promise.
 * @param observe - Returns the count after each call.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings and examples.
 * @returns A promise of the verdict.
 * @example
 * await prop.accumulates(seat, (n: number) => counter.add(n), () => counter.total,
 *   "each add counts", prop.using(prop.integer(1, 9)));
 */
export function accumulates<I>(
  seat: Seat,
  call: (input: I) => unknown,
  observe: () => Count | Promise<Count>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.accumulates, msg, options, (c, [input]) =>
    relation.accumulates(c, MODE, call, input as I, observe, msg),
  );
}

/**
 * Runs isDeterministic on call and the generated input for each case. It is
 * the form prop-deterministic, and takes the relaxations of deterministic.
 *
 * @param seat - Where the failure is reported.
 * @param call - Called with the input, twice. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isDeterministic(seat, (s: string) => render(s), "rendering is deterministic",
 *   prop.using(prop.string()));
 */
export function isDeterministic<I>(
  seat: Seat,
  call: (input: I) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isDeterministic, msg, options, (c, [input], relaxations) =>
    relation.isDeterministic(c, MODE, call, input as I, msg, ...relaxations),
  );
}

/**
 * Runs isCommutative on combine and the two inputs a and b that each case
 * generates. It is the form prop-commutative, and takes the relaxations of
 * commutative.
 *
 * @param seat - Where the failure is reported.
 * @param combine - Combines two inputs. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The inputs' generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isCommutative(seat, (a: Set<number>, b: Set<number>) => union(a, b),
 *   "union is commutative", prop.using(setOfDigits));
 */
export function isCommutative<T>(
  seat: Seat,
  combine: (a: T, b: T) => unknown,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isCommutative, msg, options, (c, [a, b], relaxations) =>
    relation.isCommutative(c, MODE, combine, a as T, b as T, msg, ...relaxations),
  );
}

/**
 * Runs isAssociative on combine and the three inputs a, b and c that each
 * case generates. It is the form prop-associative, and takes the
 * relaxations of associative.
 *
 * @param seat - Where the failure is reported.
 * @param combine - Combines two inputs. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The inputs' generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.isAssociative(seat, (a: bigint, b: bigint) => a + b, "addition is associative",
 *   prop.using(prop.integer(-10n, 10n)));
 */
export function isAssociative<T>(
  seat: Seat,
  combine: (a: T, b: T) => T | Promise<T>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.isAssociative, msg, options, (c, [a, b, x], relaxations) =>
    relation.isAssociative(
      c,
      MODE,
      combine,
      a as T,
      b as T,
      x as T,
      msg,
      ...relaxations,
    ),
  );
}

/**
 * Runs roundTrip on forward, inverse and the generated input for each case.
 * It is the form prop-round-trip, and takes the relaxations of round-trip.
 *
 * @param seat - Where the failure is reported.
 * @param forward - Encodes the input. It may return a promise.
 * @param inverse - Decodes what forward returned. It may return a promise.
 * @param msg - The contract under test.
 * @param options - The input's generator, the run's settings, examples and relaxations.
 * @returns A promise of the verdict.
 * @example
 * await prop.roundTrip(seat, (o: Order) => encode(o), (b) => decode(b),
 *   "an order survives its encoding", prop.using(prop.ofShape<Order>(orderShape)));
 */
export function roundTrip<I, E>(
  seat: Seat,
  forward: (input: I) => E | Promise<E>,
  inverse: (encoded: E) => I | Promise<I>,
  msg: string,
  ...options: FormOption[]
): Promise<void> {
  return runForm(seat, FORMS.roundTrip, msg, options, (c, [input], relaxations) =>
    relation.roundTrip(c, MODE, forward, inverse, input as I, msg, ...relaxations),
  );
}
