// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The inverses of the generators that contain other generators: one-of,
 * optional, list, dict, filter, map, composite and recursive, and the
 * optional, list and map shapes.
 *
 * A composite runs backwards to a placeholder, which makes no choice, so the
 * generator around it emits its own steps alone. A filter does not test the
 * value of a composite, and a unique list does not compare the values of its
 * composites, because the record of a composite may not state the parts
 * that they read. A dict through a composite does not run backwards: the
 * value of a map does not state the order in which the case drew its
 * entries, and the draws of the composites follow that order.
 */

import { IntegerBounds } from "../choice.js";
import type { Sizes } from "../collection.js";
import { flagBounds } from "../draw.js";
import type { Key } from "../float.js";
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
} from "../generator.js";
import { choiceKey, compareSequences } from "../order.js";
import { ListShape, MapShape, OptionalShape } from "../shape/structure.js";
import { canonical, Pairs } from "../value.js";
import { CannotInvert, NoInverse, shown } from "./refusal.js";
import {
  BIT,
  chosen,
  type Emit,
  type Emitted,
  type Emitter,
  hasPlaceholder,
  PLACEHOLDER,
  type Placeholder,
  type Step,
} from "./steps.js";

/**
 * Returns the steps of branch for value, and the refusal of a branch that
 * cannot produce value.
 *
 * @throws What the branch throws other than a refusal.
 */
function attempt(
  branch: Generator<unknown>,
  value: unknown,
  emit: Emit,
): Emitted | CannotInvert {
  try {
    return emit(branch, value);
  } catch (err) {
    if (err instanceof CannotInvert) {
      return err;
    }
    throw err;
  }
}

/** Returns the steps of a branch after the step of its index under bounds. */
function indexed(bounds: IntegerBounds, index: bigint, emitted: Emitted): Emitted {
  return [[{ bounds, value: index }, ...emitted[0]], emitted[1]];
}

/**
 * Returns the index of the first branch that produces value, then its
 * steps. A branch through a composite produces every value, so it counts
 * only when no branch produces value without one. refusal is the reason of
 * the refusal when no branch produces value.
 */
function firstBranch(
  branches: readonly (readonly [bigint, Generator<unknown>])[],
  value: unknown,
  bounds: IntegerBounds,
  refusal: string,
  emit: Emit,
): Emitted {
  let unknown = false;
  let through: Emitted | undefined;
  for (const [index, branch] of branches) {
    const emitted = attempt(branch, value, emit);
    if (emitted instanceof CannotInvert) {
      unknown ||= emitted instanceof NoInverse;
    } else if (hasPlaceholder(emitted[0])) {
      through ??= indexed(bounds, index, emitted);
    } else {
      return indexed(bounds, index, emitted);
    }
  }
  if (through !== undefined) {
    return through;
  }
  if (unknown) {
    throw new NoInverse(`prop: ${refusal}, and one of them has no inverse`);
  }
  throw new CannotInvert(`prop: ${refusal}`);
}

/** Returns the shortlex key of steps, as the shrinker orders choice sequences. */
function shortlex(steps: readonly Step[]): Key[] {
  return steps.map((s) => choiceKey(s.bounds, s.value));
}

/** Returns a collection's steps: per item a continue flag and its steps, then a stop. */
function collection(
  sizes: Sizes,
  items: readonly (readonly (Step | Placeholder)[])[],
): (Step | Placeholder)[] {
  const count = items.length;
  if (count < sizes.minSize || (sizes.maxSize !== undefined && count > sizes.maxSize)) {
    throw new CannotInvert(`prop: ${count} items are outside the collection's sizes`);
  }
  const steps: (Step | Placeholder)[] = [];
  items.forEach((item, index) => {
    steps.push({ bounds: flagBounds(index, sizes.minSize, sizes.maxSize), value: 1n });
    steps.push(...item);
  });
  steps.push({ bounds: flagBounds(count, sizes.minSize, sizes.maxSize), value: 0n });
  return steps;
}

/** Refuses values with two equal ones. */
function distinct(values: readonly unknown[]): void {
  if (new Set(values.map(canonical)).size !== values.length) {
    throw new CannotInvert(`prop: ${shown(values)} repeats a value`);
  }
}

/**
 * Returns each element's steps and the value that they decode to. A unique
 * list compares the elements without a composite alone, because the record
 * of a composite may not state its value.
 */
function elements(
  of: Generator<unknown>,
  value: unknown,
  unique: boolean,
  emit: Emit,
): Emitted[] {
  if (!Array.isArray(value)) {
    throw new CannotInvert(`prop: ${shown(value)} is no list`);
  }
  const emitted = value.map((element) => emit(of, element));
  if (unique) {
    distinct(value.filter((_, i) => !hasPlaceholder((emitted[i] as Emitted)[0])));
  }
  return emitted;
}

/**
 * Returns a map's flags and entries, each its key's steps then its value's, in shortlex order.
 *
 * @throws NoInverse when a key or a value runs backwards through a
 *   composite. The value of a map does not state the order in which the case
 *   drew its entries, and the draws of the composites follow that order.
 */
function entries(
  sizes: Sizes,
  key: Generator<unknown>,
  of: Generator<unknown>,
  value: unknown,
  emit: Emit,
): Emitted {
  if (!(value instanceof Pairs)) {
    throw new CannotInvert(`prop: ${shown(value)} is no map`);
  }
  distinct(value.items.map(([k]) => k));
  const emitted = value.items.map(([k, v]) => {
    const [keySteps, keyNormal] = emit(key, k);
    const [valueSteps, valueNormal] = emit(of, v);
    const steps = [...keySteps, ...valueSteps];
    if (hasPlaceholder(steps)) {
      throw new NoInverse(
        "prop: a map does not state the order in which its composites drew",
      );
    }
    return [chosen(steps), [keyNormal, valueNormal] as const] as const;
  });
  emitted.sort((a, b) => compareSequences(shortlex(a[0]), shortlex(b[0])));
  return [
    collection(
      sizes,
      emitted.map(([s]) => s),
    ),
    new Pairs(emitted.map(([, n]) => n)),
  ];
}

/** Returns absent, or present and then the value's steps. */
function emitOptional(of: Generator<unknown>, value: unknown, emit: Emit): Emitted {
  if (value === undefined) {
    return [[{ bounds: BIT, value: 0n }], undefined];
  }
  const [steps, normal] = emit(of, value);
  return [[{ bounds: BIT, value: 1n }, ...steps], normal];
}

/** Returns one position of a recursive value: the base, or else the extension. */
function emitRecursive(g: Recursive<unknown>, value: unknown, emit: Emit): Emitted {
  return firstBranch(
    [
      [0n, g.base],
      [1n, g.extend],
    ],
    value,
    BIT,
    `neither the base nor the extension produces ${shown(value)}`,
    emit,
  );
}

/** The inverse of each generator that contains other generators, by its class. */
export const COLLECTIONS: readonly (readonly [unknown, Emitter])[] = [
  [
    OneOf,
    (g: OneOf<unknown>, value, emit) =>
      firstBranch(
        g.of.map((branch, i) => [BigInt(i), branch] as const),
        value,
        new IntegerBounds(0n, BigInt(g.of.length - 1)),
        `no alternative produces ${shown(value)}`,
        emit,
      ),
  ],
  [Optional, (g: Optional<unknown>, value, emit) => emitOptional(g.of, value, emit)],
  [OptionalShape, (g: OptionalShape, value, emit) => emitOptional(g.of, value, emit)],
  [
    List,
    (g: List<unknown>, value, emit) => {
      const emitted = elements(g.of, value, g.unique, emit);
      return [
        collection(
          g.sizes,
          emitted.map(([s]) => s),
        ),
        emitted.map(([, n]) => n),
      ];
    },
  ],
  [
    ListShape,
    (g: ListShape, value, emit) => {
      const emitted = elements(g.of, value, g.unique, emit);
      if (g.unique) {
        emitted.sort((a, b) =>
          compareSequences(shortlex(chosen(a[0])), shortlex(chosen(b[0]))),
        );
      }
      return [
        collection(
          g.sizes,
          emitted.map(([s]) => s),
        ),
        emitted.map(([, n]) => n),
      ];
    },
  ],
  [
    Dict,
    (g: Dict<unknown, unknown>, value, emit) =>
      entries(g.sizes, g.keys, g.values, value, emit),
  ],
  [MapShape, (g: MapShape, value, emit) => entries(g.sizes, g.key, g.of, value, emit)],
  [
    Filter,
    (g: Filter<unknown>, value, emit) => {
      const emitted = emit(g.of, value);
      if (hasPlaceholder(emitted[0])) {
        return emitted;
      }
      if (!g.keep(value)) {
        throw new CannotInvert(`prop: the filter rejects ${shown(value)}`);
      }
      return emitted;
    },
  ],
  [Composite, (_g: Composite<unknown>, value) => [[PLACEHOLDER], value]],
  [
    Mapped,
    (g: Mapped<unknown, unknown>, value, emit) => {
      if (g.back === undefined) {
        throw new NoInverse("prop: a map does not run backwards");
      }
      let inner: unknown;
      try {
        inner = g.back(value);
      } catch (err) {
        if (err instanceof CannotInvert) {
          throw err;
        }
        throw new CannotInvert(
          `prop: ${shown(value)} is no value of the map: ${(err as Error).message}`,
          { cause: err },
        );
      }
      const [steps, normal] = emit(g.of, inner);
      if (hasPlaceholder(steps)) {
        return [steps, value];
      }
      return [steps, g.f(normal)];
    },
  ],
  [Recursive, (g: Recursive<unknown>, value, emit) => emitRecursive(g, value, emit)],
  [
    Position,
    (g: Position<unknown>, value, emit) => emitRecursive(g.owner, value, emit),
  ],
];
