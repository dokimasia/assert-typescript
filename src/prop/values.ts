// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The values of a generator for a seed, outside a property.
 *
 * A benchmark takes its inputs from a generator, so every run measures the
 * same inputs, and the inputs cover more paths than one literal does.
 */

import { Case, DECODE, Generating, Rejected } from "./engine/case.js";
import type { Generator } from "./engine/generator.js";
import { caseSource } from "./engine/source.js";
import { seedValue } from "./option.js";

/** The most cases that values rejects for each value that it returns, the ratio at which a run gives up. */
const REJECTIONS_PER_VALUE = 10;

/**
 * Returns n values of generator for seed: the values of the random cases of
 * seed, in order, without the cases that the generator rejects. Case k
 * decodes from the random source of seed + k, as a random case of a run
 * does, so the values are the outputs of the definition's generation and
 * shapes vectors for the seed. Two calls with one seed return the same
 * values, and a call with a larger n returns the same first values.
 *
 * values does not run a property. It does not try the simplest case or a
 * boundary case, shrink, record an assertion or write a stored case, and it
 * does not read the variables DOKIMI_ASSERT_PROP_*.
 *
 * @param generator - The generator.
 * @param seed - The seed, an integer in [0, 2^64).
 * @param n - The number of values, a whole number of 0 or more.
 * @returns The values, in order.
 * @throws RangeError for an n that is no whole number of 0 or more, and for
 *   a seed outside [0, 2^64).
 * @throws Error when the generator rejects more than ten cases for each of
 *   the n values.
 * @example
 * const ids = prop.values(prop.integer(0, 1_000_000), 42, 100);
 * bench("get", () => {
 *   for (const id of ids) store.get(id);
 * });
 */
export function values<T>(
  generator: Generator<T>,
  seed: bigint | number,
  n: number,
): T[] {
  const call = `values(generator, ${seed}, ${n})`;
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`prop: ${call} states no whole number of 0 or more`);
  }
  const start = seedValue(call, seed);
  const out: T[] = [];
  let rejected = 0;
  for (let index = 0n; out.length < n; index += 1n) {
    const c = new Case(new Generating(caseSource(start, index)));
    try {
      out.push(generator[DECODE](c));
    } catch (err) {
      if (!(err instanceof Rejected)) throw err;
      rejected += 1;
      if (rejected > REJECTIONS_PER_VALUE * n) {
        throw new Error(
          `prop: ${call} stops after the generator rejects ${rejected} cases for ${n} values`,
        );
      }
    }
  }
  return out;
}
