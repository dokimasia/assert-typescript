// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The explain phase: it fills each draw of the counterexample with four
 * random values. A draw for which every filling still fails the same way is
 * one where any value fails. For an integer draw that matters, one step
 * towards its target that passes is its nearest passing value.
 */

import { Generating } from "../case/providers.js";
import type { Drawn, Span } from "../case/record.js";
import { Failed, Rejected } from "../case/signals.js";
import { Case, DECODE } from "../case.js";
import type { Choice } from "../choice.js";
import { identityOf } from "../execution.js";
import { type Generator, Integer, Mapped } from "../generator.js";
import { Exhausted, type Failure, type Shrinker } from "../shrink.js";
import { MASK, Source } from "../source.js";
import type { Work } from "../work.js";
import { type Node, replaced } from "./nodes.js";

/** The random fillings that the explain phase tries for each draw. */
const EXPLAIN_FILLINGS = 4;

/**
 * Returns the choices with one draw's span replaced by a filling from
 * source. A fresh decode that returns no value, because it rejects the case,
 * exceeds the cap on choices or fails, is no filling, and the result is
 * undefined.
 */
function filled(
  nodes: readonly Node[],
  span: Span,
  drawn: Drawn,
  source: Source,
): Choice[] | undefined {
  const fresh = new Case(new Generating(source));
  try {
    drawn.generator[DECODE](fresh);
  } catch (err) {
    if (err instanceof Rejected || err instanceof Failed) {
      return undefined;
    }
    throw err;
  }
  return [
    ...nodes.slice(0, span.start).map((node) => node.choice),
    ...fresh.choices,
    ...nodes.slice(span.end).map((node) => node.choice),
  ];
}

/**
 * Runs the fillings of one draw from seeds, and reports whether any value
 * fails: true when every filling that decoded fails the same way, false at
 * the first that does not, and undefined when none decoded. A filling whose
 * decode returns no value is skipped, and costs no run.
 */
function* relevance(
  shrinker: Shrinker,
  failure: Failure,
  span: Span,
  drawn: Drawn,
  seeds: readonly bigint[],
): Work<boolean | undefined> {
  let decoded = false;
  for (const seed of seeds) {
    const choices = filled(failure.nodes, span, drawn, new Source(seed));
    if (choices !== undefined) {
      decoded = true;
      const execution = yield* shrinker.run(choices, "explain");
      if (identityOf(execution) !== failure.identity) {
        return false;
      }
    }
  }
  return decoded ? true : undefined;
}

/**
 * Returns an integer draw's value one step towards its target, when it
 * passes. A map of an integer is an integer draw too: its integer is its
 * choice, and its nearest passing value is what the map returns for the
 * step.
 */
function* nearest(
  shrinker: Shrinker,
  nodes: readonly Node[],
  span: Span,
  drawn: Drawn,
): Work<{ readonly value: unknown } | undefined> {
  let generator = drawn.generator as Generator<unknown>;
  const maps: Mapped<unknown, unknown>[] = [];
  while (generator instanceof Mapped) {
    maps.push(generator);
    generator = generator.of;
  }
  const value =
    maps.length > 0 ? (nodes[span.start] as Node).choice.value : drawn.value;
  if (!(generator instanceof Integer) || typeof value !== "bigint") {
    return undefined;
  }
  const { target } = generator.bounds;
  if (value === target) {
    return undefined;
  }
  const stepped = value > target ? value - 1n : value + 1n;
  const choices = replaced(nodes, span.start, stepped).map((node) => node.choice);
  const execution = yield* shrinker.run(choices, "explain");
  if (execution.status !== "passed") {
    return undefined;
  }
  let found: unknown = stepped;
  for (const mapped of maps.reverse()) {
    found = mapped.f(found);
  }
  return { value: found };
}

/**
 * One draw of the counterexample, explained. anyValueFails is undefined
 * when the draw makes no choice, no filling decodes, or the budget ran out
 * before its fillings. nearest is the value one step towards the target,
 * for an integer draw where that value passes.
 */
export interface Explained {
  readonly label: string;
  readonly value: unknown;
  readonly anyValueFails: boolean | undefined;
  readonly nearest: { readonly value: unknown } | undefined;
}

/**
 * Returns the seed of a draw's filling: seed + (draw + 1) × 2^32 + filling,
 * modulo 2^64.
 *
 * @param seed - The run's seed.
 * @param draw - The draw's position in the case.
 * @param filling - The filling's position.
 * @returns The seed.
 */
export function explainSeed(seed: bigint, draw: number, filling: number): bigint {
  return (seed + (BigInt(draw + 1) << 32n) + BigInt(filling)) & MASK;
}

/**
 * Explains each draw of a failure's case, spending what remains of the
 * budget. Filling j of draw d decodes from the stream of
 * seed + (d + 1) × 2^32 + j.
 *
 * @param shrinker - The shrinker, whose budget the runs spend.
 * @param failure - The failure.
 * @param seed - The run's seed.
 * @returns The work, which returns each draw's explanation.
 */
export function* explain(
  shrinker: Shrinker,
  failure: Failure,
  seed: bigint,
): Work<Explained[]> {
  const c = failure.execution.case;
  const explained: Explained[] = [];
  for (const [number, drawn] of c.draws.entries()) {
    const span = c.spans[drawn.span] as Span;
    const unexplained = {
      label: drawn.label,
      value: drawn.value,
      anyValueFails: undefined,
      nearest: undefined,
    };
    if (span.start === span.end) {
      explained.push(unexplained);
    } else {
      const seeds = Array.from({ length: EXPLAIN_FILLINGS }, (_, j) =>
        explainSeed(seed, number, j),
      );
      try {
        const anyValue = yield* relevance(shrinker, failure, span, drawn, seeds);
        const near =
          anyValue === false
            ? yield* nearest(shrinker, failure.nodes, span, drawn)
            : undefined;
        explained.push({
          label: drawn.label,
          value: drawn.value,
          anyValueFails: anyValue,
          nearest: near,
        });
      } catch (err) {
        if (!(err instanceof Exhausted)) {
          throw err;
        }
        explained.push(unexplained);
      }
    }
  }
  return explained;
}
