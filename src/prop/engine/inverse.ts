// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Running a generator backwards: the choices that decode to a given value.
 *
 * invert walks a generator with a value and emits each choice in the order
 * that the generator's decode asks for it, with the bounds that it asks
 * with. Each choice is checked against its bounds as it is emitted. invert
 * then replays the choices, and returns them only when they decode to the
 * value and the case records them unchanged. A value that the generator
 * cannot produce throws CannotInvert: a value of another type, one outside
 * its bounds, a collection of another size, or a set or a map with a
 * repeated element.
 *
 * Every generator but a map without an inverse and a bind runs backwards,
 * and a filter does through the generator that it filters. A function that
 * the engine cannot run backwards throws NoInverse, which tells it from a
 * value outside a domain. A one-of and a recursive throw NoInverse when no
 * branch produces the value and one of them has no inverse.
 *
 * A composite runs backwards to a placeholder, which makes no choice. In a
 * trace the draws of the composite take their own entries, so invertThrough
 * returns the choices of the generator around its composites. invert
 * refuses a value through a composite with NoInverse, because no trace
 * serves the draws of the composite there.
 *
 * Where more than one sequence of choices decodes to a value, the inverse
 * takes the first in a fixed order:
 *
 * - one-of: its first alternative whose inverse succeeds without a
 *   composite, and else its first alternative through a composite.
 * - sampled-from: the first index of an equal value.
 * - permutation: the smallest index at each swap.
 * - string-matching: the match that a backtracking engine finds first,
 *   which tries alternatives in order and repeats each quantifier as often
 *   as the rest of the pattern allows.
 * - optional: absent before present.
 * - recursive: the base before the extension, by the rule of a one-of.
 * - a set's elements and a map's entries: in the shortlex order of their
 *   own choices.
 *
 * A zoned-date-time and a wall-time run backwards through the branch that
 * takes the whole range.
 */

import { Replaying } from "./case/providers.js";
import { Rejected } from "./case/signals.js";
import { Case, DECODE } from "./case.js";
import { type Choice, choiceOf, sameChoice } from "./choice.js";
import {
  Composite,
  Dict,
  Filter,
  type Generator,
  List,
  Mapped,
  OneOf,
  Optional,
  Position,
  Recursive,
} from "./generator.js";
import { COLLECTIONS } from "./inverse/collections.js";
import { CannotInvert, NoInverse, shown } from "./inverse/refusal.js";
import { SCALARS } from "./inverse/scalars.js";
import { SHAPES } from "./inverse/shapes.js";
import {
  chosen,
  type Emitted,
  type Emitter,
  hasPlaceholder,
  madeChoices,
  type Step,
} from "./inverse/steps.js";
import { canonical } from "./value.js";

/** The inverse of each kind of generator, by its class. */
const EMITTERS = new Map<unknown, Emitter>([...SCALARS, ...COLLECTIONS, ...SHAPES]);

/**
 * Returns the generators inside a generator that run backwards with it. A
 * recursive that seen has returns none, and joins seen otherwise.
 */
function inner(
  generator: Generator<unknown>,
  seen: Set<Recursive<unknown>>,
): readonly Generator<unknown>[] {
  if (generator instanceof OneOf) {
    return generator.of;
  }
  if (
    generator instanceof Optional ||
    generator instanceof List ||
    generator instanceof Filter ||
    (generator instanceof Mapped && generator.back !== undefined)
  ) {
    return [generator.of];
  }
  if (generator instanceof Dict) {
    return [generator.keys, generator.values];
  }
  if (generator instanceof Position) {
    return [generator.owner];
  }
  if (generator instanceof Recursive && !seen.has(generator)) {
    seen.add(generator);
    return [generator.base, generator.extend];
  }
  return [];
}

/**
 * Reports whether a generator is a composite or has one inside, at any
 * depth. seen has the recursive generators on the way, so a position inside
 * the extension of a recursive ends the walk.
 */
function holdsComposite(
  generator: Generator<unknown>,
  seen: Set<Recursive<unknown>>,
): boolean {
  return (
    generator instanceof Composite ||
    inner(generator, seen).some((g) => holdsComposite(g, seen))
  );
}

/**
 * Returns the choices of steps once they decode to normal and the case
 * records them unchanged.
 *
 * @throws CannotInvert when the choices decode to another value, or to no
 *   value.
 */
function verified(
  generator: Generator<unknown>,
  value: unknown,
  steps: readonly Step[],
  normal: unknown,
): Choice[] {
  const choices = steps.map((emitted) => choiceOf(emitted.bounds, emitted.value));
  const c = new Case(new Replaying(choices));
  let decoded: unknown;
  try {
    decoded = generator[DECODE](c);
  } catch (err) {
    if (err instanceof Rejected) {
      throw new CannotInvert(`prop: ${shown(value)} decodes to no value`, {
        cause: err,
      });
    }
    throw err;
  }
  const unchanged =
    c.choices.length === choices.length &&
    c.choices.every((choice, i) => sameChoice(choice, choices[i] as Choice));
  if (!unchanged || canonical(decoded) !== canonical(normal)) {
    throw new CannotInvert(
      `prop: ${shown(value)} is no value that the generator produces`,
    );
  }
  return choices;
}

/**
 * Returns the choices that decode to value.
 *
 * @param generator - The generator.
 * @param value - The value.
 * @returns The choices.
 * @throws NoInverse when a generator on the way applies a function that the
 *   engine cannot run backwards, or value runs backwards through a
 *   composite, whose draws no trace serves here.
 * @throws CannotInvert when the generator cannot produce value.
 */
export function invert(generator: Generator<unknown>, value: unknown): Choice[] {
  const [steps, normal] = emit(generator, value);
  return verified(generator, value, chosen(steps), normal);
}

/**
 * Returns the choices of a generator around its composites for value, and
 * whether value runs backwards through one. A composite inside the generator
 * makes no choice, and its draws take their own entries in a trace. A value
 * without a composite has the choices of invert. A value through a composite
 * does not replay here, because the draws of the composite need the entries
 * of the trace.
 *
 * @param generator - The generator.
 * @param value - The value.
 * @returns The choices, and true when value runs backwards through a
 *   composite.
 * @throws NoInverse when a generator on the way applies a function that the
 *   engine cannot run backwards.
 * @throws CannotInvert when the generator cannot produce value.
 */
export function invertThrough(
  generator: Generator<unknown>,
  value: unknown,
): readonly [Choice[], boolean] {
  const [steps, normal] = emit(generator, value);
  if (hasPlaceholder(steps)) {
    return [madeChoices(steps).map((s) => choiceOf(s.bounds, s.value)), true];
  }
  return [verified(generator, value, chosen(steps), normal), false];
}

/**
 * Reports whether a generator has a composite inside a generator with an
 * inverse. A one-of, an optional, a list, a dict, a filter, a map with an
 * inverse and a recursive count, at any depth. A composite on its own does
 * not. A map without an inverse and a bind do not either, because they do
 * not run backwards.
 *
 * @param generator - The generator.
 * @returns True for a generator that has a composite inside.
 */
export function throughComposite(generator: Generator<unknown>): boolean {
  return !(generator instanceof Composite) && holdsComposite(generator, new Set());
}

/**
 * Returns the choices that decode to value, or undefined when invert
 * throws CannotInvert or NoInverse.
 *
 * @param generator - The generator.
 * @param value - The value.
 * @returns The choices, or undefined.
 * @throws What the generator throws while it decodes the choices.
 */
export function inverseOf(
  generator: Generator<unknown>,
  value: unknown,
): Choice[] | undefined {
  try {
    return invert(generator, value);
  } catch (err) {
    if (err instanceof CannotInvert) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Returns the choices of a generator around its composites for value, and
 * whether value runs backwards through one, as invertThrough does, or
 * undefined when invertThrough throws CannotInvert or NoInverse.
 *
 * @param generator - The generator.
 * @param value - The value.
 * @returns The choices and whether value runs backwards through a
 *   composite, or undefined.
 * @throws What the generator throws while it runs backwards.
 */
export function inverseThrough(
  generator: Generator<unknown>,
  value: unknown,
): readonly [Choice[], boolean] | undefined {
  try {
    return invertThrough(generator, value);
  } catch (err) {
    if (err instanceof CannotInvert) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Returns the steps that one generator emits for value, each within its
 * bounds.
 *
 * @param generator - The generator.
 * @param value - The value.
 * @returns The steps, and the value that they decode to.
 * @throws CannotInvert when a step falls outside its bounds, or the value is
 *   of a type that the generator never decodes.
 * @throws NoInverse when the generator applies a function that it cannot
 *   run backwards.
 */
export function emit(generator: Generator<unknown>, value: unknown): Emitted {
  const emitter = EMITTERS.get(generator.constructor);
  if (emitter === undefined) {
    throw new NoInverse(`prop: a ${generator.constructor.name} does not run backwards`);
  }
  return emitter(generator as never, value, emit);
}
