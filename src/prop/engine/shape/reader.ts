// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The reader of one shape file: it checks the keys of each shape and the
 * refs between the definitions, and builds each shape with the builder of
 * its id.
 */

import { compareText } from "../../../order.js";
import type { Generator } from "../generator.js";
import { ShapeError, shown } from "./error.js";
import { isNode, type Node } from "./parameters.js";
import { Budget, Root } from "./structure.js";

/** What each shape takes besides `shape`: its required keys, then the keys that it may state. */
const KEYS: ReadonlyMap<string, readonly [readonly string[], readonly string[]]> =
  new Map([
    ["bool", [[], []]],
    [
      "int",
      [
        ["width", "signed"],
        ["min", "max"],
      ],
    ],
    ["float", [["width"], ["min", "max", "allow_nan", "allow_infinity"]]],
    ["char", [[], ["alphabet"]]],
    ["string", [[], ["min_size", "max_size", "alphabet", "pattern"]]],
    ["bytes", [[], ["min_size", "max_size"]]],
    ["list", [["of"], ["min_size", "max_size"]]],
    ["fixed-list", [["of", "size"], []]],
    ["set", [["of"], ["min_size", "max_size"]]],
    [
      "map",
      [
        ["key", "of"],
        ["min_size", "max_size"],
      ],
    ],
    ["optional", [["of"], []]],
    ["record", [["fields"], []]],
    ["enum", [["variants"], []]],
    ["literal", [["values"], []]],
    ["ref", [["name"], []]],
    ["uuid", [[], []]],
    ["ip-address", [[], ["version"]]],
    ["decimal", [["scale"], ["min", "max"]]],
    ["instant", [["unit"], ["min", "max"]]],
    ["date", [[], ["min", "max"]]],
    ["time-of-day", [["unit"], ["min", "max"]]],
    ["local-date-time", [["unit"], ["min", "max"]]],
    ["duration", [["unit"], ["min", "max"]]],
    ["offset", [[], ["min", "max"]]],
    ["zone", [[], []]],
    ["zoned-date-time", [["unit"], []]],
    ["wall-time", [["unit"], []]],
  ]);

/** The keys that only a shape file's root states. */
const ROOT_KEYS = new Set(["definitions", "source"]);

/**
 * Returns the names that each name of a graph refers to through a path of
 * edges. A name refers to itself only through a cycle.
 *
 * @param graph - The names that each name refers to directly.
 * @returns The names that each name refers to through a path.
 */
function closure(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Set<string>> {
  const paths = new Map([...graph].map(([name, named]) => [name, new Set(named)]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, named] of paths) {
      const wider = new Set(
        [...named].flatMap((target) => [target, ...(paths.get(target) ?? [])]),
      );
      if (wider.size !== named.size) {
        paths.set(name, wider);
        changed = true;
      }
    }
  }
  return paths;
}

/** One shape file being read: its definitions, the generators of the names it does not define, and the budget of its values. */
export class Reader {
  readonly #document: Node;
  readonly #externals: ReadonlyMap<string, Generator<unknown>>;
  readonly #builders: ReadonlyMap<string, Builder>;
  readonly budget = new Budget();
  readonly built = new Map<string, Generator<unknown>>();
  readonly #sources = new Map<string, Node>();
  cyclic: ReadonlySet<string> = new Set();

  /**
   * Returns the reader of a shape file.
   *
   * @param document - The shape file, as its JSON parses.
   * @param externals - The generators of names that the file does not define.
   * @param builders - The builder of each shape, by id.
   */
  constructor(
    document: Node,
    externals: ReadonlyMap<string, Generator<unknown>>,
    builders: ReadonlyMap<string, Builder>,
  ) {
    this.#document = document;
    this.#externals = externals;
    this.#builders = builders;
  }

  /** Reads the definitions, checks that each has a finite value, then reads the root. */
  root(): Generator<unknown> {
    const definitions =
      "definitions" in this.#document ? this.#document["definitions"] : {};
    if (!isNode(definitions)) {
      throw new ShapeError("prop: definitions is not a map of names to shapes");
    }
    for (const [name, node] of Object.entries(definitions)) {
      if (!isNode(node)) {
        throw new ShapeError(
          `prop: definitions.${name} is ${shown(node)}, not a shape`,
        );
      }
      this.#sources.set(name, node);
    }
    const source = this.#document["source"];
    const stated =
      source === undefined ||
      source === null ||
      (isNode(source) &&
        typeof source["language"] === "string" &&
        typeof source["type"] === "string");
    if (!stated) {
      throw new ShapeError(
        `prop: source is ${shown(source)}, not a language and a type`,
      );
    }
    this.cyclic = this.#cyclicNames();
    this.#finite();
    for (const [name, generator] of this.#externals) {
      if (!this.#sources.has(name)) {
        this.built.set(name, generator);
      }
    }
    for (const [name, node] of this.#sources) {
      this.built.set(name, this.build(node, `definitions.${name}`));
    }
    const root = this.build(this.#document, "shape", true);
    return this.cyclic.size > 0 ? new Root(root, this.budget) : root;
  }

  /**
   * Returns the name of every ref inside node, without following refs. With
   * stopAtExits, a container that can always exit is not entered, so only
   * the refs that every value of node expands remain.
   */
  refs(node: unknown, stopAtExits = false): string[] {
    if (Array.isArray(node)) {
      return node.flatMap((item) => this.refs(item, stopAtExits));
    }
    if (!isNode(node)) {
      return [];
    }
    if (node["shape"] === "ref") {
      return [String(node["name"])];
    }
    if (stopAtExits && this.exits(node)) {
      return [];
    }
    return Object.entries(node)
      .filter(([key]) => !ROOT_KEYS.has(key) && key !== "values")
      .flatMap(([, value]) => this.refs(value, stopAtExits));
  }

  /** Returns the definitions that can refer to themselves through refs. */
  #cyclicNames(): Set<string> {
    const graph = this.#graph(false);
    const targets = [
      ...this.refs(this.#document),
      ...[...graph.values()].flatMap((named) => [...named]),
    ];
    const unknown = targets.find(
      (target) => !(this.#sources.has(target) || this.#externals.has(target)),
    );
    if (unknown !== undefined) {
      throw new ShapeError(
        `prop: a ref names ${shown(unknown)}, which is no definition`,
      );
    }
    const paths = closure(graph);
    return new Set(
      [...paths].filter(([name, named]) => named.has(name)).map(([name]) => name),
    );
  }

  /**
   * Returns the refs of each definition. With stopAtExits, only the refs that
   * every value of the definition expands.
   */
  #graph(stopAtExits: boolean): Map<string, Set<string>> {
    return new Map(
      [...this.#sources].map(([name, node]) => [
        name,
        new Set(this.refs(node, stopAtExits)),
      ]),
    );
  }

  /** Reports whether node contains a ref to a definition that can refer to itself. */
  refersBack(node: unknown): boolean {
    return this.refs(node).some((name) => this.cyclic.has(name));
  }

  /**
   * Reports whether a container can always take an exit: an optional can be
   * absent, a list, a set or a map without a minimum size can be empty, and
   * an enum can take a variant that does not refer back.
   */
  exits(node: Node): boolean {
    const kind = node["shape"];
    if (kind === "optional") {
      return true;
    }
    if (kind === "list" || kind === "set" || kind === "map") {
      return (
        node["min_size"] === undefined ||
        node["min_size"] === null ||
        node["min_size"] === 0
      );
    }
    return kind === "enum" && this.exitVariant(node) !== undefined;
  }

  /** Returns the index of an enum's first variant that does not refer back. */
  exitVariant(node: Node): number | undefined {
    const variants = node["variants"];
    const listed = Array.isArray(variants) ? variants : [];
    const index = listed.findIndex((variant) => {
      const payload =
        Array.isArray(variant) && variant.length === 2 ? variant[1] : undefined;
      return !this.refersBack(payload);
    });
    return index < 0 ? undefined : index;
  }

  /** Refuses a definition that refers to itself through refs that every value expands. */
  #finite(): void {
    const must = closure(this.#graph(true));
    const endless = [...this.cyclic]
      .sort(compareText)
      .find((name) => must.get(name)?.has(name));
    if (endless !== undefined) {
      throw new ShapeError(
        `prop: definitions.${endless} has no finite value, because it refers back without an optional, a list, a set, a map or an enum that can exit`,
      );
    }
  }

  /** Returns the generator of one shape. */
  build(node: Node, where: string, root = false): Generator<unknown> {
    const kind = node["shape"];
    const keys = typeof kind === "string" ? KEYS.get(kind) : undefined;
    if (keys === undefined) {
      throw new ShapeError(`prop: ${where} is ${shown(kind)}, which is no shape`);
    }
    const [required, optional] = keys;
    const stated = Object.keys(node).filter(
      (key) => key !== "shape" && !(root && ROOT_KEYS.has(key)),
    );
    const missing = required.filter((key) => !stated.includes(key)).sort(compareText);
    if (missing.length > 0) {
      throw new ShapeError(
        `prop: ${where} states no ${missing[0]}, which the ${kind} shape needs`,
      );
    }
    const extra = stated
      .filter((key) => !(required.includes(key) || optional.includes(key)))
      .sort(compareText);
    if (extra.length > 0) {
      throw new ShapeError(
        `prop: ${where}.${extra[0]} does not apply to the ${kind} shape`,
      );
    }
    try {
      return (this.#builders.get(kind as string) as Builder)(this, node, where);
    } catch (err) {
      if (err instanceof ShapeError) {
        throw err;
      }
      throw new ShapeError(`prop: ${where}: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }

  /** Returns the generator of a shape nested in another. */
  child(node: unknown, where: string): Generator<unknown> {
    if (!isNode(node)) {
      throw new ShapeError(`prop: ${where} is ${shown(node)}, not a shape`);
    }
    return this.build(node, where);
  }
}

/** Reads one shape's node into its generator. */
export type Builder = (reader: Reader, node: Node, where: string) => Generator<unknown>;
