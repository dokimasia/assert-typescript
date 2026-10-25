// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The inverses of the generators that contain other generators: one-of,
 * optional, list, dict, filter, map and recursive, and the optional, list
 * and map shapes.
 */

import { IntegerBounds } from "../choice.js";
import type { Sizes } from "../collection.js";
import { flagBounds } from "../draw.js";
import type { Key } from "../float.js";
import {
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
import { BIT, type Emit, type Emitted, type Emitter, type Step } from "./steps.js";

/**
 * Returns the index of the first branch that produces value, then its
 * steps. refusal is the reason of the refusal when no branch produces
 * value.
 */
function firstBranch(
  branches: readonly (readonly [bigint, Generator<unknown>])[],
  value: unknown,
  bounds: IntegerBounds,
  refusal: string,
  emit: Emit,
): Emitted {
  let unknown = false;
  for (const [index, branch] of branches) {
    let emitted: Emitted | undefined;
    try {
      emitted = emit(branch, value);
    } catch (err) {
      if (err instanceof NoInverse) {
        unknown = true;
      } else if (!(err instanceof CannotInvert)) {
        throw err;
      }
    }
    if (emitted !== undefined) {
      return [[{ bounds, value: index }, ...emitted[0]], emitted[1]];
    }
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
function collection(sizes: Sizes, items: readonly (readonly Step[])[]): Step[] {
  const count = items.length;
  if (count < sizes.minSize || (sizes.maxSize !== undefined && count > sizes.maxSize)) {
    throw new CannotInvert(`prop: ${count} items are outside the collection's sizes`);
  }
  const steps: Step[] = [];
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

/** Returns each element's steps and the value that they decode to. */
function elements(
  of: Generator<unknown>,
  value: unknown,
  unique: boolean,
  emit: Emit,
): Emitted[] {
  if (!Array.isArray(value)) {
    throw new CannotInvert(`prop: ${shown(value)} is no list`);
  }
  if (unique) {
    distinct(value);
  }
  return value.map((element) => emit(of, element));
}

/** Returns a map's flags and entries, each its key's steps then its value's, in shortlex order. */
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
    return [[...keySteps, ...valueSteps], [keyNormal, valueNormal] as const] as const;
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
        emitted.sort((a, b) => compareSequences(shortlex(a[0]), shortlex(b[0])));
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
      if (!g.keep(value)) {
        throw new CannotInvert(`prop: the filter rejects ${shown(value)}`);
      }
      return emit(g.of, value);
    },
  ],
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
      return [steps, g.f(normal)];
    },
  ],
  [Recursive, (g: Recursive<unknown>, value, emit) => emitRecursive(g, value, emit)],
  [
    Position,
    (g: Position<unknown>, value, emit) => emitRecursive(g.owner, value, emit),
  ],
];
