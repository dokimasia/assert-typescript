/**
 * The relations: properties of a subject that hold across calls, rather
 * than of one value.
 *
 * Each callable may return a promise, which the relation awaits. A throw or
 * a rejection of a callable fails the relation, unless the relation
 * requires a failure, as `failsAfterClose` and `isPoisoned` do. The failure
 * states what the callable threw in the field of the step that it ended,
 * and null in the field of a step that did not run. Each relation that
 * awaits reads its call site when it starts, before its first `await`.
 */

import { callSite } from "../failure.js";
import { equal as compare } from "./compare.js";
import { matchesTarget } from "./errors.js";
import { type Option, type Relaxations, settings } from "./option.js";
import type { Mode, Seat } from "./seat.js";
import { fail, pass, Running } from "./verdict.js";

/**
 * How many times `isDeterministic` calls its subject, `hasStableOrder`
 * iterates it and `isPoisoned` reads it. A subject whose results vary can
 * agree with itself by chance in fewer runs.
 */
const REPETITIONS = 32;

/** A number or a bigint, as `accumulates` reads one. */
export type Count = number | bigint;

/** A sequence that `hasStableOrder` and `noDuplicates` read. */
export type Sequence<T> = Iterable<T> | AsyncIterable<T>;

/** What a step returned, or what it threw or rejected with. */
type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly thrown: unknown };

/** Runs step, and returns its value or what it threw or rejected with. */
async function attempt<T>(step: () => T | Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await step() };
  } catch (thrown) {
    return { ok: false, thrown };
  }
}

/**
 * Returns the detail of a failure of the step at index i of a relation
 * that compares first and second: the failure is first for the first step,
 * and second for every later one.
 */
function failedAt(i: number, thrown: unknown): Record<string, unknown> {
  return i === 0 ? { first: thrown, second: null } : { first: null, second: thrown };
}

/**
 * Runs first, then second, and reports the first of them that fails, or a
 * failure of both values when they differ under relax.
 */
async function settle(
  run: Running,
  mode: Mode,
  assertion: string,
  msg: string,
  first: () => unknown,
  second: () => unknown,
  relax: Relaxations,
): Promise<void> {
  const a = await attempt(first);
  if (!a.ok) {
    run.fail(mode, assertion, msg, failedAt(0, a.thrown));
    return;
  }
  const b = await attempt(second);
  if (!b.ok) {
    run.fail(mode, assertion, msg, failedAt(1, b.thrown));
    return;
  }
  if (!compare(b.value, a.value, relax)) {
    run.fail(mode, assertion, msg, { first: a.value, second: b.value });
    return;
  }
  run.pass(mode, assertion, msg);
}

/**
 * Runs produce REPETITIONS times, and reports the first result that
 * differs from the first result under relax, or the first run that fails.
 */
async function agree(
  run: Running,
  mode: Mode,
  assertion: string,
  msg: string,
  produce: () => unknown,
  relax: Relaxations,
): Promise<void> {
  let first: unknown;
  for (let i = 0; i < REPETITIONS; i += 1) {
    const next = await attempt(produce);
    if (!next.ok) {
      run.fail(mode, assertion, msg, failedAt(i, next.thrown));
      return;
    }
    if (i === 0) {
      first = next.value;
      continue;
    }
    if (!compare(next.value, first, relax)) {
      run.fail(mode, assertion, msg, { first, second: next.value });
      return;
    }
  }
  run.pass(mode, assertion, msg);
}

/**
 * Returns the elements of one iteration of iterate, or null for an absent
 * sequence. iterate returns an iterable, an async iterable, or a promise of
 * either.
 */
async function collect(
  iterate: () => Sequence<unknown> | Promise<Sequence<unknown>>,
): Promise<unknown[] | null> {
  const source: unknown = await iterate();
  if (source === null || source === undefined) return null;
  if (Symbol.asyncIterator in Object(source)) {
    const items: unknown[] = [];
    for await (const item of source as AsyncIterable<unknown>) items.push(item);
    return items;
  }
  return Array.from(source as Iterable<unknown>);
}

/**
 * Fail when a second call of call with input leaves observe reading other
 * than the first call left it. first is the reading after one call, and
 * second the reading after two.
 */
export async function isIdempotent<I>(
  seat: Seat,
  mode: Mode,
  call: (input: I) => unknown,
  input: I,
  observe: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const step = async () => {
    await call(input);
    return await observe();
  };
  await settle(run, mode, "idempotent", msg, step, step, settings(options));
}

/**
 * Returns to minus from: a number of two numbers, and a bigint of two
 * bigints. A number and a bigint throw a TypeError, as `-` does.
 */
function change(from: Count, to: Count): Count {
  return (to as number) - (from as number);
}

/**
 * Fail when the first call of call with input leaves the count that
 * observe reads unchanged, or the second call changes it by another
 * amount. first and second are the changes of the two calls.
 */
export async function accumulates<I>(
  seat: Seat,
  mode: Mode,
  call: (input: I) => unknown,
  input: I,
  observe: () => Count | Promise<Count>,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  let before: Count = 0;
  let after: Count = 0;
  const first = await attempt(async () => {
    before = await observe();
    await call(input);
    after = await observe();
    return change(before, after);
  });
  if (!first.ok) {
    run.fail(mode, "accumulates", msg, failedAt(0, first.thrown));
    return;
  }
  const second = await attempt(async () => {
    await call(input);
    return change(after, await observe());
  });
  if (!second.ok) {
    run.fail(mode, "accumulates", msg, failedAt(1, second.thrown));
    return;
  }
  if (after === before || first.value !== second.value) {
    run.fail(mode, "accumulates", msg, { first: first.value, second: second.value });
    return;
  }
  run.pass(mode, "accumulates", msg);
}

/**
 * Fail when one of 32 calls of call with input returns a result other
 * than the first. first is the first result, and second the first result
 * that differs.
 */
export async function isDeterministic<I>(
  seat: Seat,
  mode: Mode,
  call: (input: I) => unknown,
  input: I,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  await agree(run, mode, "deterministic", msg, () => call(input), settings(options));
}

/**
 * Fail when combine(a, b) differs from combine(b, a). first is
 * combine(a, b), and second combine(b, a).
 */
export async function isCommutative<T>(
  seat: Seat,
  mode: Mode,
  combine: (a: T, b: T) => unknown,
  a: T,
  b: T,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  await settle(
    run,
    mode,
    "commutative",
    msg,
    () => combine(a, b),
    () => combine(b, a),
    settings(options),
  );
}

/**
 * Fail when combine(combine(a, b), c) differs from
 * combine(a, combine(b, c)). first is the left grouping, and second the
 * right one.
 */
export async function isAssociative<T>(
  seat: Seat,
  mode: Mode,
  combine: (a: T, b: T) => T | Promise<T>,
  a: T,
  b: T,
  c: T,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  await settle(
    run,
    mode,
    "associative",
    msg,
    async () => combine(await combine(a, b), c),
    async () => combine(a, await combine(b, c)),
    settings(options),
  );
}

/**
 * Fail when inverse of forward of input differs from input. want is input,
 * and got what came back. A throw of forward or inverse fails with want
 * null and got what it threw.
 */
export async function roundTrip<I, E>(
  seat: Seat,
  mode: Mode,
  forward: (input: I) => E | Promise<E>,
  inverse: (encoded: E) => I | Promise<I>,
  input: I,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const back = await attempt(async () => inverse(await forward(input)));
  if (!back.ok) {
    run.fail(mode, "round-trip", msg, { want: null, got: back.thrown });
    return;
  }
  if (!compare(back.value, input, settings(options))) {
    run.fail(mode, "round-trip", msg, { want: input, got: back.value });
    return;
  }
  run.pass(mode, "round-trip", msg);
}

/**
 * Fail when one of 32 iterations of iterate yields a sequence other than
 * the first. first is the first sequence, and second the first sequence
 * that differs. An absent sequence is null.
 */
export async function hasStableOrder<T>(
  seat: Seat,
  mode: Mode,
  iterate: () => Sequence<T> | Promise<Sequence<T>>,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  await agree(
    run,
    mode,
    "stable-order",
    msg,
    () => collect(iterate),
    settings(options),
  );
}

/**
 * Fail when one iteration of iterate yields an element equal to an earlier
 * one. got is that element, and index its position. Each element is
 * compared with every earlier one. A throw of iterate fails with got what
 * it threw and index null.
 */
export async function noDuplicates<T>(
  seat: Seat,
  mode: Mode,
  iterate: () => Sequence<T> | Promise<Sequence<T>>,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const iterated = await attempt(() => collect(iterate));
  if (!iterated.ok) {
    run.fail(mode, "no-duplicates", msg, { got: iterated.thrown, index: null });
    return;
  }
  const relax = settings(options);
  const items = iterated.value ?? [];
  for (const [index, item] of items.entries()) {
    if (items.slice(0, index).some((earlier) => compare(item, earlier, relax))) {
      run.fail(mode, "no-duplicates", msg, { got: item, index });
      return;
    }
  }
  run.pass(mode, "no-duplicates", msg);
}

/**
 * Fail when a reading of observe falls below the reading before it or is
 * NaN, while advance runs steps times. index is the position of that
 * reading, the reading before the first step at position 0. first is the
 * reading before it, null at position 0, and second that reading. A throw
 * of advance or observe fails with index and first null and second what it
 * threw.
 */
export async function isMonotonic(
  seat: Seat,
  mode: Mode,
  observe: () => number | Promise<number>,
  advance: () => unknown,
  steps: number,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const threw = (thrown: unknown) =>
    run.fail(mode, "monotonic", msg, { index: null, first: null, second: thrown });

  const start = await attempt(observe);
  if (!start.ok) {
    threw(start.thrown);
    return;
  }
  let previous = start.value;
  if (Number.isNaN(previous)) {
    run.fail(mode, "monotonic", msg, { index: 0, first: null, second: previous });
    return;
  }
  for (let i = 1; i <= steps; i += 1) {
    const next = await attempt(async () => {
      await advance();
      return await observe();
    });
    if (!next.ok) {
      threw(next.thrown);
      return;
    }
    if (Number.isNaN(next.value) || next.value < previous) {
      run.fail(mode, "monotonic", msg, {
        index: i,
        first: previous,
        second: next.value,
      });
      return;
    }
    previous = next.value;
  }
  run.pass(mode, "monotonic", msg);
}

/**
 * Fail at the first element of domain, in order, for which call throws or
 * rejects. index is its position, and got what call threw. An empty domain
 * passes.
 */
export async function isTotal<I>(
  seat: Seat,
  mode: Mode,
  call: (input: I) => unknown,
  domain: Iterable<I>,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  for (const [index, element] of [...domain].entries()) {
    const outcome = await attempt(() => call(element));
    if (!outcome.ok) {
      run.fail(mode, "total", msg, { index, got: outcome.thrown });
      return;
    }
  }
  run.pass(mode, "total", msg);
}

/**
 * Fail when fn leaves what observe reads unchanged. got is the reading
 * that did not change, or what observe or fn threw.
 */
export async function isNotPure(
  seat: Seat,
  mode: Mode,
  observe: () => unknown,
  fn: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const readings = await attempt(async () => {
    const before = await observe();
    await fn();
    return [before, await observe()] as const;
  });
  if (!readings.ok) {
    run.fail(mode, "not-pure", msg, { got: readings.thrown });
    return;
  }
  const [before, after] = readings.value;
  if (compare(after, before, settings(options))) {
    run.fail(mode, "not-pure", msg, { got: after });
    return;
  }
  run.pass(mode, "not-pure", msg);
}

/**
 * Fail when call, after close, does not throw or reject with sentinel,
 * through the chain of causes. want is sentinel, and got what call threw,
 * or null when it returned. A throw of close fails with want null and got
 * what it threw.
 */
export async function failsAfterClose(
  seat: Seat,
  mode: Mode,
  close: () => unknown,
  call: () => unknown,
  sentinel: unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const closed = await attempt(close);
  if (!closed.ok) {
    run.fail(mode, "after-close", msg, { want: null, got: closed.thrown });
    return;
  }
  const used = await attempt(call);
  if (used.ok || !matchesTarget(used.thrown, sentinel)) {
    run.fail(mode, "after-close", msg, {
      want: sentinel,
      got: used.ok ? null : used.thrown,
    });
    return;
  }
  run.pass(mode, "after-close", msg);
}

/**
 * Fail when, after induce, one of 32 readings of observe returns rather
 * than throws or rejects. index is the position of that reading, and got
 * what it returned. A throw of induce fails with index null and got what
 * it threw.
 */
export async function isPoisoned(
  seat: Seat,
  mode: Mode,
  induce: () => unknown,
  observe: () => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const run = Running.of(seat, callSite());
  const induced = await attempt(induce);
  if (!induced.ok) {
    run.fail(mode, "poisoned", msg, { index: null, got: induced.thrown });
    return;
  }
  for (let index = 0; index < REPETITIONS; index += 1) {
    const reading = await attempt(observe);
    if (reading.ok) {
      run.fail(mode, "poisoned", msg, { index, got: reading.value });
      return;
    }
  }
  run.pass(mode, "poisoned", msg);
}

/**
 * Reports whether every element of got has a partner of its own in want:
 * a matching of the bipartite graph whose edges join equal elements, which
 * augmenting paths find when one exists. A greedy match is not enough
 * under equateEmpty, which makes null equal both [] and {} while those two
 * differ.
 */
function matched(
  got: readonly unknown[],
  want: readonly unknown[],
  relax: Relaxations,
): boolean {
  if (got.length !== want.length) return false;
  const edges = got.map((g) => want.map((w) => compare(g, w, relax)));
  const partner: number[] = want.map(() => -1);
  const augment = (i: number, seen: boolean[]): boolean =>
    want.some((_, j) => {
      if (!(edges[i] as boolean[])[j] || seen[j]) return false;
      seen[j] = true;
      const held = partner[j] as number;
      if (held >= 0 && !augment(held, seen)) return false;
      partner[j] = i;
      return true;
    });
  return got.every((_, i) =>
    augment(
      i,
      want.map(() => false),
    ),
  );
}

/**
 * Fail when got does not contain the elements of want, each as often, in
 * any order. Elements compare as `equal` compares them. A value that is no
 * array, such as an absent list, compares with the other as `equal`
 * compares them.
 */
export function isPermutation(
  seat: Seat,
  mode: Mode,
  got: unknown,
  want: unknown,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  const relax = settings(options);
  const same =
    Array.isArray(got) && Array.isArray(want)
      ? matched(got, want, relax)
      : compare(got, want, relax);
  if (!same) {
    fail(seat, mode, "permutation", msg, { want, got });
    return;
  }
  pass(seat, mode, "permutation", msg);
}
