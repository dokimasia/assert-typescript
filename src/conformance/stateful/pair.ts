// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The machine of the subject pair-fails-at-7-and-3: a machine without a
 * spec, whose put takes a composite input and fails for the pair 7 and 3.
 */

import { Failure } from "../../failure.js";
import type { Case } from "../../prop/case.js";
import { composite, integer } from "../../prop/generators.js";
import { steps } from "../../stateful/steps.js";
import { marked, type Setup } from "./setup.js";

/** The largest digit of a pair, and the draw of its digits. */
const MAX_DIGIT = 9;
const DIGITS = integer(0, MAX_DIGIT);

/** The input of put. The composite draws a digit under `a` and then one under `b`, and returns the list of the two. */
const PAIRS = composite((c) => [c.draw(DIGITS, "a"), c.draw(DIGITS, "b")]);

/** The label of the input of put, which is also the assertion of the record of its failure. */
const PAIR = "pair";

/** The pair that put fails for. */
const FAILING = [7, 3];

/**
 * Runs the machine of the actions noop and put. noop does nothing. put
 * draws its pair under `pair`, and fails with the record of pair for the
 * pair 7 and 3. The actions do not record calls.
 */
export async function pairFails(c: Case, setup: Setup): Promise<void> {
  await steps(
    c,
    {
      actions: marked(setup, [
        { name: "noop", run: () => undefined },
        {
          name: "put",
          input: (step) => step.draw(PAIRS, PAIR),
          run: (step, _client, pair) => {
            if (JSON.stringify(pair) === JSON.stringify(FAILING)) {
              step.report(
                new Failure(PAIR, `put of the pair [${FAILING.join(", ")}]`, {}),
                true,
              );
            }
          },
        },
      ]),
    },
    ...setup.steps,
  );
}
