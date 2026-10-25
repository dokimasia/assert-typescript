// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The generators of the structural shapes: a ref, an optional, a list, a
 * map, a record and an enum, and the root of a recursive shape. A value of a
 * recursive shape has a budget of nodes. Once the value has used it, each
 * container that refers back takes its exit.
 */

import { type Case, DECODE } from "../case.js";
import { IntegerBounds } from "../choice.js";
import { collect, ELEMENT, ENTRY, type Sizes } from "../collection.js";
import { Generator } from "../generator.js";
import { canonical, Fields, Pairs, Variant } from "../value.js";

/** The nodes that one value of a recursive shape may use. */
const BUDGET = 100;

/** The nodes that each value in progress of one shape file has used. */
export class Budget {
  readonly #used: number[] = [];

  /** Returns what fn returns, with the nodes of one value counted from zero while it decodes. */
  value<T>(fn: () => T): T {
    this.#used.push(0);
    try {
      return fn();
    } finally {
      this.#used.pop();
    }
  }

  /** Counts one node of the value in progress. */
  spend(): void {
    this.#used.push((this.#used.pop() as number) + 1);
  }

  /** Whether the value in progress has used its budget. */
  get exhausted(): boolean {
    return this.#used.length > 0 && (this.#used.at(-1) as number) >= BUDGET;
  }
}

/** A recursive shape's root: it counts the budget of each value from zero. */
export class Root extends Generator<unknown> {
  /** The root shape's generator. */
  readonly node: Generator<unknown>;
  readonly #budget: Budget;

  constructor(node: Generator<unknown>, budget: Budget) {
    super();
    this.node = node;
    this.#budget = budget;
  }

  /** Returns one value of the root shape. */
  [DECODE](c: Case): unknown {
    return this.#budget.value(() => this.node[DECODE](c));
  }
}

/** The value of a definition, by name. A cyclic one counts one node. */
export class Ref extends Generator<unknown> {
  /** The definition's name. */
  readonly name: string;
  /** The generators of the definitions. */
  readonly definitions: ReadonlyMap<string, Generator<unknown>>;
  readonly #cyclic: boolean;
  readonly #budget: Budget;

  constructor(
    name: string,
    definitions: ReadonlyMap<string, Generator<unknown>>,
    cyclic: boolean,
    budget: Budget,
  ) {
    super();
    this.name = name;
    this.definitions = definitions;
    this.#cyclic = cyclic;
    this.#budget = budget;
  }

  /** Returns the value of the named definition. */
  [DECODE](c: Case): unknown {
    if (this.#cyclic) {
      this.#budget.spend();
    }
    return (this.definitions.get(this.name) as Generator<unknown>)[DECODE](c);
  }
}

/** A value or undefined: a presence choice, which is forced absent at an exit. */
export class OptionalShape extends Generator<unknown> {
  /** The generator of the value. */
  readonly of: Generator<unknown>;
  readonly #exits: boolean;
  readonly #budget: Budget;

  constructor(of: Generator<unknown>, exits: boolean, budget: Budget) {
    super();
    this.of = of;
    this.#exits = exits;
    this.#budget = budget;
  }

  /** Returns undefined when absent, and the decoded value when present. */
  [DECODE](c: Case): unknown {
    const forced = this.#exits && this.#budget.exhausted;
    const bounds = new IntegerBounds(0n, forced ? 0n : 1n);
    return c.span("optional", () =>
      c.integer(bounds, 1n) === 1n ? this.of[DECODE](c) : undefined,
    );
  }
}

/** A list, a fixed-list or a set: elements as a collection, empty at an exit. A set's elements are unique. */
export class ListShape extends Generator<unknown[]> {
  /** The generator of the elements. */
  readonly of: Generator<unknown>;
  /** The sizes. */
  readonly sizes: Sizes;
  /** Whether the elements are unique, as a set's are. */
  readonly unique: boolean;
  readonly #exits: boolean;
  readonly #budget: Budget;

  constructor(
    of: Generator<unknown>,
    sizes: Sizes,
    unique: boolean,
    exits: boolean,
    budget: Budget,
  ) {
    super();
    this.of = of;
    this.sizes = sizes;
    this.unique = unique;
    this.#exits = exits;
    this.#budget = budget;
  }

  /** Returns the elements that the case's flags and choices decode to. */
  [DECODE](c: Case): unknown[] {
    const stop = this.#exits ? () => this.#budget.exhausted : undefined;
    return c.span("list", () =>
      collect(
        c,
        this.sizes,
        ELEMENT,
        () => {
          const value = this.of[DECODE](c);
          return [value, this.unique ? canonical(value) : undefined] as const;
        },
        stop,
      ),
    );
  }
}

/** A map: entries with distinct keys, as a dict decodes them, empty at an exit. */
export class MapShape extends Generator<Pairs> {
  /** The generator of the keys. */
  readonly key: Generator<unknown>;
  /** The generator of the values. */
  readonly of: Generator<unknown>;
  /** The sizes. */
  readonly sizes: Sizes;
  readonly #exits: boolean;
  readonly #budget: Budget;

  constructor(
    key: Generator<unknown>,
    of: Generator<unknown>,
    sizes: Sizes,
    exits: boolean,
    budget: Budget,
  ) {
    super();
    this.key = key;
    this.of = of;
    this.sizes = sizes;
    this.#exits = exits;
    this.#budget = budget;
  }

  /** Returns the entries that the case's flags, keys and values decode to. */
  [DECODE](c: Case): Pairs {
    const stop = this.#exits ? () => this.#budget.exhausted : undefined;
    return c.span("dict", () => {
      const entries = collect(
        c,
        this.sizes,
        ENTRY,
        () => {
          const key = this.key[DECODE](c);
          return [[key, this.of[DECODE](c)] as const, canonical(key)] as const;
        },
        stop,
      );
      return new Pairs(entries);
    });
  }
}

/** Named fields, each decoded in declaration order, as one span. */
export class RecordShape extends Generator<Fields> {
  /** The fields, each a name and a generator. */
  readonly fields: readonly (readonly [string, Generator<unknown>])[];

  constructor(fields: readonly (readonly [string, Generator<unknown>])[]) {
    super();
    this.fields = fields;
  }

  /** Returns the record of each field's value. */
  [DECODE](c: Case): Fields {
    return c.span(
      "record",
      () => new Fields(this.fields.map(([name, of]) => [name, of[DECODE](c)] as const)),
    );
  }
}

/**
 * A variant: an index that decides structure, then its payload when it has
 * one. exit is the index of the first variant that does not refer back,
 * which the index takes once the budget is used, and undefined when the enum
 * does not refer back.
 */
export class EnumShape extends Generator<Variant> {
  /** The variants, each a name and the generator of its payload, or undefined. */
  readonly variants: readonly (readonly [string, Generator<unknown> | undefined])[];
  readonly #exit: number | undefined;
  readonly #budget: Budget;

  constructor(
    variants: readonly (readonly [string, Generator<unknown> | undefined])[],
    exit: number | undefined,
    budget: Budget,
  ) {
    super();
    this.variants = variants;
    this.#exit = exit;
    this.#budget = budget;
  }

  /** Returns the variant that the case chooses. */
  [DECODE](c: Case): Variant {
    let bounds = new IntegerBounds(0n, BigInt(this.variants.length - 1));
    if (this.#exit !== undefined && this.#budget.exhausted) {
      bounds = new IntegerBounds(BigInt(this.#exit), BigInt(this.#exit));
    }
    return c.span("enum", () => {
      const [name, payload] = this.variants[Number(c.integer(bounds, 0n))] as readonly [
        string,
        Generator<unknown> | undefined,
      ];
      return payload === undefined
        ? new Variant(name)
        : new Variant(name, payload[DECODE](c));
    });
  }
}
