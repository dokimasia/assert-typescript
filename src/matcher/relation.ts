// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The relations: properties of a subject that hold across calls, rather
 * than of one value.
 *
 * Each callable may return a promise, which the relation awaits. A throw or
 * a rejection of a callable fails the relation. The failure states what the
 * callable threw in the field of the step that it ended, and null in the
 * field of a step that did not run. Each relation that awaits reads its
 * call site when it starts, before its first `await`.
 */

import { callSite } from "../failure.js";
import { equal as compare } from "./compare.js";
import { type Option, settings } from "./option.js";
import { agree, attempt, failedAt, settle } from "./repeat.js";
import type { Mode, Seat } from "./seat.js";
import { Running } from "./verdict.js";

/**
 * Returns to minus from: a number of two numbers, and a bigint of two
 * bigints. A number and a bigint throw a TypeError, as `-` does.
 */
function change(from: Count, to: Count): Count {
  return (to as number) - (from as number);
}

/** A number or a bigint, as `accumulates` reads one. */
export type Count = number | bigint;

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
