// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The machines of the subjects of the pair: machines without a spec, whose
 * put draws its input through a composite pair and fails for the pair 7 and
 * 3. pair-fails-at-7-and-3 draws the composite itself,
 * one-of-pair-fails-at-7-and-3 draws a one-of of a digit and the composite,
 * and pairs-fail-at-7-and-3 draws a list of 0 to 3 composites.
 */

import { Failure } from "../../failure.js";
import type { Case } from "../../prop/case.js";
import type { Generator } from "../../prop/engine/generator.js";
import { list } from "../../prop/generators/collections.js";
import { composite, integer, oneOf } from "../../prop/generators.js";
import { steps } from "../../stateful/steps.js";
import { marked, type Setup } from "./setup.js";

/** The largest digit of a pair, and the draw of its digits. */
const MAX_DIGIT = 9;
const DIGITS = integer(0, MAX_DIGIT);

/** The composite pair. It draws a digit under `a` and then one under `b`, and returns the list of the two. */
const PAIRS = composite((c) => [c.draw(DIGITS, "a"), c.draw(DIGITS, "b")]);

/** The input of the put of one-of-pair-fails-at-7-and-3: a one-of of a digit and the pair. */
const DIGIT_OR_PAIR = oneOf<unknown>(DIGITS, PAIRS);

/** The largest size of a list of pairs, and the input of the put of pairs-fail-at-7-and-3. */
const MAX_PAIRS = 3;
const PAIR_LISTS = list(PAIRS, { maxSize: MAX_PAIRS });

/** The assertion of the record of the failure of put, which is also the label of the input of a pair. */
const PAIR = "pair";

/** The label of the input of pairs-fail-at-7-and-3. */
const PAIRS_LABEL = "pairs";

/** The pair that put fails for, and the integer that the put of the one-of fails for. */
const FAILING = [7, 3];
const FAILING_DIGIT = 7;

/**
 * Returns the message of the failure of the put of input, and undefined for
 * an input that put takes: the integer 7 and the pair 7 and 3 fail, and so
 * does a list that has the pair.
 */
function failureOf(input: unknown): string | undefined {
  const pair = JSON.stringify(FAILING);
  if (input === FAILING_DIGIT) {
    return `put of the integer ${FAILING_DIGIT}`;
  }
  const lists = Array.isArray(input) ? [input, ...input] : [];
  if (lists.some((value) => JSON.stringify(value) === pair)) {
    return `put of the pair [${FAILING.join(", ")}]`;
  }
  return undefined;
}

/**
 * Runs the machine of the actions noop and put. noop does nothing. put
 * draws its input from generator under label, and fails with the record of
 * pair for the integer 7, the pair 7 and 3, and a list that has the pair.
 * The actions do not record calls.
 */
async function run(
  c: Case,
  setup: Setup,
  generator: Generator<unknown>,
  label: string,
): Promise<void> {
  await steps(
    c,
    {
      actions: marked(setup, [
        { name: "noop", run: () => undefined },
        {
          name: "put",
          input: (step) => step.draw(generator, label),
          run: (step, _client, input) => {
            const failure = failureOf(input);
            if (failure !== undefined) {
              step.report(new Failure(PAIR, failure, {}), true);
            }
          },
        },
      ]),
    },
    ...setup.steps,
  );
}

/**
 * Runs the machine of pair-fails-at-7-and-3, whose put draws the pair under
 * `pair`.
 */
export async function pairFails(c: Case, setup: Setup): Promise<void> {
  await run(c, setup, PAIRS, PAIR);
}

/**
 * Runs the machine of one-of-pair-fails-at-7-and-3, whose put draws a digit
 * or the pair under `pair`.
 */
export async function oneOfPairFails(c: Case, setup: Setup): Promise<void> {
  await run(c, setup, DIGIT_OR_PAIR, PAIR);
}

/**
 * Runs the machine of pairs-fail-at-7-and-3, whose put draws a list of pairs
 * under `pairs`.
 */
export async function pairsFail(c: Case, setup: Setup): Promise<void> {
  await run(c, setup, PAIR_LISTS, PAIRS_LABEL);
}
