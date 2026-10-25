// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The relations of sequences: the order and the elements of the iterations
 * of a subject, and a permutation of two sequences. A throw or a rejection
 * of a callable fails the relation.
 */

import { callSite } from "../failure.js";
import { equal as compare } from "./compare.js";
import { type Option, type Relaxations, settings } from "./option.js";
import { agree, attempt } from "./repeat.js";
import type { Mode, Seat } from "./seat.js";
import { fail, pass, Running } from "./verdict.js";

/**
 * Returns the elements of one iteration of iterate, or null for an absent
 * sequence. iterate returns an iterable, an async iterable, or a promise of
 * either.
 */
async function collect(
  iterate: () => Sequence<unknown> | Promise<Sequence<unknown>>,
): Promise<unknown[] | null> {
  const source: unknown = await iterate();
  if (source === null || source === undefined) {
    return null;
  }
  if (Symbol.asyncIterator in new Object(source)) {
    const items: unknown[] = [];
    for await (const item of source as AsyncIterable<unknown>) {
      items.push(item);
    }
    return items;
  }
  return Array.from(source as Iterable<unknown>);
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
  if (got.length !== want.length) {
    return false;
  }
  const edges = got.map((g) => want.map((w) => compare(g, w, relax)));
  const partner: number[] = want.map(() => -1);
  const augment = (i: number, seen: boolean[]): boolean =>
    want.some((_, j) => {
      if (!(edges[i] as boolean[])[j] || seen[j]) {
        return false;
      }
      seen[j] = true;
      const held = partner[j] as number;
      if (held >= 0 && !augment(held, seen)) {
        return false;
      }
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

/** A sequence that `hasStableOrder` and `noDuplicates` read. */
export type Sequence<T> = Iterable<T> | AsyncIterable<T>;

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
