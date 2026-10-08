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
 * Every generator but a map without an inverse, a bind and a composite runs
 * backwards, and a filter does through the generator that it filters. A
 * function that the engine cannot run backwards throws NoInverse, which
 * tells it from a value outside a domain. A one-of and a recursive throw
 * NoInverse when no branch produces the value and one of them has no
 * inverse.
 *
 * Where more than one sequence of choices decodes to a value, the inverse
 * takes the first in a fixed order:
 *
 * - one-of: its first alternative whose inverse succeeds.
 * - sampled-from: the first index of an equal value.
 * - permutation: the smallest index at each swap.
 * - string-matching: the match that a backtracking engine finds first,
 *   which tries alternatives in order and repeats each quantifier as often
 *   as the rest of the pattern allows.
 * - optional: absent before present.
 * - recursive: the base before the extension.
 * - a set's elements and a map's entries: in the shortlex order of their
 *   own choices.
 *
 * A zoned-date-time and a wall-time run backwards through the branch that
 * takes the whole range.
 */

import * as alphabet from "./alphabet.js";
import { Case, DECODE, Rejected, Replaying } from "./case.js";
import {
  type Bounds,
  type Choice,
  choiceOf,
  IntegerBounds,
  sameChoice,
  UINT64_MAX,
  type Value,
} from "./choice.js";
import type { Sizes } from "./collection.js";
import { flagBounds } from "./draw.js";
import type { Key } from "./float.js";
import {
  Bool,
  Bytes,
  Dict,
  Filter,
  Float,
  type Generator,
  Integer,
  Just,
  List,
  Mapped,
  Matching,
  OneOf,
  Optional,
  Permutation,
  Position,
  Recursive,
  SampledFrom,
  Text,
} from "./generator.js";
import { choiceKey, compareSequences } from "./order.js";
import { Alternation, Class, Literal, type Repeat, Sequence } from "./pattern.js";
import {
  EnumShape,
  halves,
  InstantShape,
  Int128Shape,
  IpShape,
  ListShape,
  LocalDateTimeShape,
  MapShape,
  OptionalShape,
  RecordShape,
  Ref,
  Root,
  secondPart,
  WallShape,
  ZonedShape,
} from "./shape.js";
import { canonical, Fields, Pairs, Variant } from "./value.js";
import { ZONES } from "./zone.js";

/** A value that a generator cannot produce from any sequence of choices. */
export class CannotInvert extends Error {
  /**
   * Returns the refusal of a value.
   *
   * @param message - Why the generator cannot produce the value.
   */
  constructor(message: string) {
    super(message);
    this.name = "CannotInvert";
  }
}

/**
 * A value whose choices the engine cannot compute: a generator on the way
 * applies a function that the engine cannot run backwards.
 */
export class NoInverse extends CannotInvert {}

/** One emitted choice: the bounds that its request states, and its value. */
interface Step {
  readonly bounds: Bounds;
  readonly value: Value;
}

/**
 * The steps that a generator emits for a value, and the value that they
 * decode to, which differs from the given value only in the order of a
 * set's elements and a map's entries.
 */
type Emitted = readonly [steps: Step[], normal: unknown];

/** The bounds of a choice of 0 or 1. */
const BIT = new IntegerBounds(0n, 1n);

/** The bounds of the index of a zone of the list. */
const ZONE_INDEX = new IntegerBounds(0n, BigInt(ZONES.length - 1));

/** The choice of a zoned value whose zone has a change that takes the whole range. */
const WHOLE_RANGE = 0n;

/** Returns the text of a value, for a refusal's message. */
function shown(value: unknown): string {
  return canonical(value);
}

/**
 * Returns the choices that decode to value.
 *
 * @param generator - The generator.
 * @param value - The value.
 * @returns The choices.
 * @throws NoInverse when a generator on the way applies a function that the
 *   engine cannot run backwards.
 * @throws CannotInvert when the generator cannot produce value.
 */
export function invert(generator: Generator<unknown>, value: unknown): Choice[] {
  const [steps, normal] = emit(generator, value);
  const choices = steps.map((step) => choiceOf(step.bounds, step.value));
  const c = new Case(new Replaying(choices));
  let decoded: unknown;
  try {
    decoded = generator[DECODE](c);
  } catch (err) {
    if (err instanceof Rejected)
      throw new CannotInvert(`prop: ${shown(value)} decodes to no value`);
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
    if (err instanceof CannotInvert) return undefined;
    throw err;
  }
}

/** Returns a step whose value its bounds admit, or throws CannotInvert. */
function step(bounds: Bounds, value: unknown): Step {
  if (!bounds.admits(value))
    throw new CannotInvert(`prop: ${shown(value)} is outside ${bounds.id}`);
  return { bounds, value: value as Value };
}

/** Returns the first index of a value equal to value, or throws CannotInvert. */
function indexOf(values: readonly unknown[], value: unknown): number {
  const wanted = canonical(value);
  const index = values.findIndex((candidate) => canonical(candidate) === wanted);
  if (index < 0) throw new CannotInvert(`prop: ${shown(value)} is none of the values`);
  return index;
}

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
): Emitted {
  let unknown = false;
  for (const [index, branch] of branches) {
    let emitted: Emitted;
    try {
      emitted = emit(branch, value);
    } catch (err) {
      if (err instanceof NoInverse) unknown = true;
      else if (!(err instanceof CannotInvert)) throw err;
      continue;
    }
    return [[{ bounds, value: index }, ...emitted[0]], emitted[1]];
  }
  if (unknown) throw new NoInverse(`prop: ${refusal}, and one of them has no inverse`);
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
function elements(of: Generator<unknown>, value: unknown, unique: boolean): Emitted[] {
  if (!Array.isArray(value)) throw new CannotInvert(`prop: ${shown(value)} is no list`);
  if (unique) distinct(value);
  return value.map((element) => emit(of, element));
}

/** Returns a map's flags and entries, each its key's steps then its value's, in shortlex order. */
function entries(
  sizes: Sizes,
  key: Generator<unknown>,
  of: Generator<unknown>,
  value: unknown,
): Emitted {
  if (!(value instanceof Pairs))
    throw new CannotInvert(`prop: ${shown(value)} is no map`);
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

/** Returns the two fields of a record of a two-choice shape. */
function twoParts(
  value: unknown,
  names: readonly [string, string],
): readonly [unknown, unknown] {
  const fields = value instanceof Fields ? value.fields : undefined;
  if (
    fields?.length !== 2 ||
    fields[0]?.[0] !== names[0] ||
    fields[1]?.[0] !== names[1]
  ) {
    throw new CannotInvert(
      `prop: ${shown(value)} is no record of ${names.join(" and ")}`,
    );
  }
  return [
    (fields[0] as readonly [string, unknown])[1],
    (fields[1] as readonly [string, unknown])[1],
  ];
}

/** Returns the zone's index and the whole-range choice, and the other part. */
function zoneSteps(value: unknown, part: string): readonly [Step[], unknown] {
  const [inner, name] = twoParts(value, [part, "zone"]);
  const index = indexOf(
    ZONES.map((zone) => zone.name),
    name,
  );
  const steps: Step[] = [{ bounds: ZONE_INDEX, value: BigInt(index) }];
  if ((ZONES[index] as (typeof ZONES)[number]).changes.length > 0) {
    steps.push({ bounds: BIT, value: WHOLE_RANGE });
  }
  return [steps, inner];
}

/** Returns the one way that a literal or a class matches the character at at, or none. */
function single(
  piece: Literal | Class,
  chars: readonly string[],
  at: number,
): (readonly [number, Step[]])[] {
  const char = chars[at];
  if (char === undefined) return [];
  if (piece instanceof Literal) return char === piece.char ? [[at + 1, []]] : [];
  const offset = piece.offsetOf(char);
  if (offset === undefined) return [];
  const bounds = new IntegerBounds(0n, BigInt(piece.size - 1));
  return [[at + 1, [{ bounds, value: BigInt(offset) }]]];
}

/** Yields each way that piece matches the characters from at: where it ends, and its steps. */
function* matches(
  piece: unknown,
  chars: readonly string[],
  at: number,
): Iterable<readonly [number, Step[]]> {
  if (piece instanceof Literal || piece instanceof Class) {
    yield* single(piece, chars, at);
  } else if (piece instanceof Sequence) {
    yield* sequence(piece.items, chars, at);
  } else if (piece instanceof Alternation) {
    for (const [index, branch] of piece.branches.entries()) {
      for (const [end, steps] of matches(branch, chars, at)) {
        yield [end, [{ bounds: piece.bounds, value: BigInt(index) }, ...steps]];
      }
    }
  } else {
    yield* repeat(piece as Repeat, chars, at, 0);
  }
}

/** Yields each way that the items match one after another from at. */
function* sequence(
  items: readonly unknown[],
  chars: readonly string[],
  at: number,
): Iterable<readonly [number, Step[]]> {
  if (items.length === 0) {
    yield [at, []];
    return;
  }
  for (const [middle, first] of matches(items[0], chars, at)) {
    for (const [end, rest] of sequence(items.slice(1), chars, middle))
      yield [end, [...first, ...rest]];
  }
}

/**
 * Yields each way that the repetitions from count on match, the most first.
 * A repetition that matches nothing is not repeated beyond the minimum, so
 * the search ends.
 */
function* repeat(
  piece: Repeat,
  chars: readonly string[],
  at: number,
  count: number,
): Iterable<readonly [number, Step[]]> {
  const sizes = piece.sizes;
  const flag = flagBounds(count, sizes.minSize, sizes.maxSize);
  if (flag.hi === 1n) {
    for (const [middle, item] of matches(piece.item, chars, at)) {
      if (middle === at && count >= sizes.minSize) continue;
      for (const [end, rest] of repeat(piece, chars, middle, count + 1)) {
        yield [end, [{ bounds: flag, value: 1n }, ...item, ...rest]];
      }
    }
  }
  if (flag.lo === 0n) yield [at, [{ bounds: flag, value: 0n }]];
}

/** Returns the steps that one generator of a kind emits for a value. */
type Emitter = (generator: never, value: unknown) => Emitted;

/** The inverse of each kind of generator, by its class. */
const EMITTERS = new Map<unknown, Emitter>([
  [Integer, (g: Integer, value) => [[step(g.bounds, value)], value]],
  [Float, (g: Float, value) => [[step(g.bounds, value)], value]],
  [
    Bool,
    (_g: Bool, value) => {
      if (typeof value !== "boolean")
        throw new CannotInvert(`prop: ${shown(value)} is no boolean`);
      return [[{ bounds: BIT, value: value ? 1n : 0n }], value];
    },
  ],
  [
    Just,
    (g: Just<unknown>, value) => {
      if (canonical(value) !== canonical(g.value)) {
        throw new CannotInvert(`prop: ${shown(value)} is not ${shown(g.value)}`);
      }
      return [[], value];
    },
  ],
  [
    SampledFrom,
    (g: SampledFrom<unknown>, value) => {
      const index = indexOf(g.values, value);
      const bounds = new IntegerBounds(0n, BigInt(g.values.length - 1));
      return [[{ bounds, value: BigInt(index) }], value];
    },
  ],
  [
    OneOf,
    (g: OneOf<unknown>, value) =>
      firstBranch(
        g.of.map((branch, i) => [BigInt(i), branch] as const),
        value,
        new IntegerBounds(0n, BigInt(g.of.length - 1)),
        `no alternative produces ${shown(value)}`,
      ),
  ],
  [Optional, (g: Optional<unknown>, value) => emitOptional(g.of, value)],
  [OptionalShape, (g: OptionalShape, value) => emitOptional(g.of, value)],
  [
    List,
    (g: List<unknown>, value) => {
      const emitted = elements(g.of, value, g.unique);
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
    (g: ListShape, value) => {
      const emitted = elements(g.of, value, g.unique);
      if (g.unique)
        emitted.sort((a, b) => compareSequences(shortlex(a[0]), shortlex(b[0])));
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
    (g: Dict<unknown, unknown>, value) => entries(g.sizes, g.keys, g.values, value),
  ],
  [MapShape, (g: MapShape, value) => entries(g.sizes, g.key, g.of, value)],
  [
    Text,
    (g: Text, value) => {
      if (typeof value !== "string")
        throw new CannotInvert(`prop: ${shown(value)} is no string`);
      const characters = g.characters;
      const indices = [...value].map((char) =>
        characters === undefined ? alphabet.indexOf(char) : characters.indexOf(char),
      );
      if (indices.some((i) => i === undefined || i < 0)) {
        throw new CannotInvert(
          `prop: ${shown(value)} has a character outside the alphabet`,
        );
      }
      return [[step(g.bounds, indices)], value];
    },
  ],
  [
    Bytes,
    (g: Bytes, value) => {
      if (!(value instanceof Uint8Array))
        throw new CannotInvert(`prop: ${shown(value)} is no bytes`);
      return [[step(g.bounds, [...value])], value];
    },
  ],
  [
    Matching,
    (g: Matching, value) => {
      if (typeof value !== "string")
        throw new CannotInvert(`prop: ${shown(value)} is no string`);
      const chars = [...value];
      for (const [end, steps] of matches(g.piece, chars, 0)) {
        if (end === chars.length) return [steps, value];
      }
      throw new CannotInvert(
        `prop: the pattern does not match ${shown(value)} in full`,
      );
    },
  ],
  [
    Permutation,
    (g: Permutation<unknown>, value) => {
      const current = [...g.values];
      if (!Array.isArray(value) || value.length !== current.length) {
        throw new CannotInvert(`prop: ${shown(value)} is no permutation of the values`);
      }
      const steps: Step[] = [];
      const last = current.length - 1;
      for (let i = 0; i < last; i += 1) {
        const j = i + indexOf(current.slice(i), value[i]);
        steps.push({
          bounds: new IntegerBounds(BigInt(i), BigInt(last)),
          value: BigInt(j),
        });
        [current[i], current[j]] = [current[j], current[i]];
      }
      if (canonical(current) !== canonical(value)) {
        throw new CannotInvert(`prop: ${shown(value)} is no permutation of the values`);
      }
      return [steps, value];
    },
  ],
  [
    Filter,
    (g: Filter<unknown>, value) => {
      if (!g.keep(value))
        throw new CannotInvert(`prop: the filter rejects ${shown(value)}`);
      return emit(g.of, value);
    },
  ],
  [
    Mapped,
    (g: Mapped<unknown, unknown>, value) => {
      if (g.back === undefined)
        throw new NoInverse("prop: a map does not run backwards");
      let inner: unknown;
      try {
        inner = g.back(value);
      } catch (err) {
        if (err instanceof CannotInvert) throw err;
        throw new CannotInvert(
          `prop: ${shown(value)} is no value of the map: ${(err as Error).message}`,
        );
      }
      const [steps, normal] = emit(g.of, inner);
      return [steps, g.f(normal)];
    },
  ],
  [Recursive, (g: Recursive<unknown>, value) => emitRecursive(g, value)],
  [Position, (g: Position<unknown>, value) => emitRecursive(g.owner, value)],
  [Root, (g: Root, value) => emit(g.node, value)],
  [
    Ref,
    (g: Ref, value) => emit(g.definitions.get(g.name) as Generator<unknown>, value),
  ],
  [
    RecordShape,
    (g: RecordShape, value) => {
      const names = g.fields.map(([name]) => name);
      const stated = value instanceof Fields ? value.fields.map(([name]) => name) : [];
      if (
        stated.length !== names.length ||
        stated.some((name, i) => name !== names[i])
      ) {
        throw new CannotInvert(
          `prop: ${shown(value)} is no record of ${names.join(", ")}`,
        );
      }
      const steps: Step[] = [];
      const normal = g.fields.map(([name, of], i) => {
        const [fieldSteps, fieldNormal] = emit(
          of,
          ((value as Fields).fields[i] as readonly [string, unknown])[1],
        );
        steps.push(...fieldSteps);
        return [name, fieldNormal] as const;
      });
      return [steps, new Fields(normal)];
    },
  ],
  [
    EnumShape,
    (g: EnumShape, value) => {
      const names = g.variants.map(([name]) => name);
      const index = value instanceof Variant ? names.indexOf(value.name) : -1;
      if (index < 0)
        throw new CannotInvert(
          `prop: ${shown(value)} is no variant of ${names.join(", ")}`,
        );
      const variant = value as Variant;
      const payload = (
        g.variants[index] as readonly [string, Generator<unknown> | undefined]
      )[1];
      const head: Step = {
        bounds: new IntegerBounds(0n, BigInt(names.length - 1)),
        value: BigInt(index),
      };
      if (payload === undefined) {
        if (variant.hasPayload)
          throw new CannotInvert(`prop: the variant ${variant.name} has no payload`);
        return [[head], value];
      }
      const [steps, normal] = emit(payload, variant.payload);
      return [[head, ...steps], new Variant(variant.name, normal)];
    },
  ],
  [
    Int128Shape,
    (g: Int128Shape, value) => {
      if (typeof value !== "bigint")
        throw new CannotInvert(`prop: ${shown(value)} is no integer`);
      const lo = halves(g.lo);
      const hi = halves(g.hi);
      const [high, low] = halves(value);
      const first = step(new IntegerBounds(lo[0], hi[0]), high);
      return [[first, step(secondPart(high, lo, hi, UINT64_MAX), low)], value];
    },
  ],
  [
    InstantShape,
    (g: InstantShape, value) => {
      const [seconds, units] = twoParts(value, ["seconds", "units"]);
      const steps = [step(new IntegerBounds(g.lo[0], g.hi[0]), seconds)];
      if (g.per === 1n) {
        if (units !== 0n) {
          throw new CannotInvert(
            `prop: an instant at seconds has no units, not ${shown(units)}`,
          );
        }
        return [steps, value];
      }
      return [
        [...steps, step(secondPart(seconds as bigint, g.lo, g.hi, g.per - 1n), units)],
        value,
      ];
    },
  ],
  [
    LocalDateTimeShape,
    (g: LocalDateTimeShape, value) => {
      const [day, time] = twoParts(value, ["date", "time-of-day"]);
      const first = step(new IntegerBounds(g.lo[0], g.hi[0]), day);
      const top = 86_400n * g.per - 1n;
      return [[first, step(secondPart(day as bigint, g.lo, g.hi, top), time)], value];
    },
  ],
  [
    ZonedShape,
    (g: ZonedShape, value) => {
      const [steps, instant] = zoneSteps(value, "instant");
      return [[...steps, ...emit(g.instant, instant)[0]], value];
    },
  ],
  [
    WallShape,
    (g: WallShape, value) => {
      const [steps, local] = zoneSteps(value, "local-date-time");
      return [[...steps, ...emit(g.local, local)[0]], value];
    },
  ],
  [
    IpShape,
    (g: IpShape, value) => {
      if (!(value instanceof Uint8Array))
        throw new CannotInvert(`prop: ${shown(value)} is no address`);
      const index = g.versions.findIndex(
        (version) => version.bounds.minSize === value.length,
      );
      if (index < 0)
        throw new CannotInvert(`prop: ${shown(value)} is neither 4 nor 16 bytes`);
      const [steps] = emit(g.versions[index] as Bytes, value);
      return [[{ bounds: BIT, value: BigInt(index) }, ...steps], value];
    },
  ],
]);

/** Returns absent, or present and then the value's steps. */
function emitOptional(of: Generator<unknown>, value: unknown): Emitted {
  if (value === undefined) return [[{ bounds: BIT, value: 0n }], undefined];
  const [steps, normal] = emit(of, value);
  return [[{ bounds: BIT, value: 1n }, ...steps], normal];
}

/** Returns one position of a recursive value: the base, or else the extension. */
function emitRecursive(g: Recursive<unknown>, value: unknown): Emitted {
  return firstBranch(
    [
      [0n, g.base],
      [1n, g.extend],
    ],
    value,
    BIT,
    `neither the base nor the extension produces ${shown(value)}`,
  );
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
  return emitter(generator as never, value);
}
