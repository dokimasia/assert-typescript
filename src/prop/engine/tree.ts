/**
 * The case tree: the choice sequences that a run generated, as a trie.
 *
 * A node is one choice request, recorded with its bounds, and an edge is the
 * value that the request took. A case that ends marks its last node as a
 * leaf, with how it ended. A Walker follows one case down the tree and
 * finds:
 *
 * - A repeated case. A body is a function of its choices, so a choice that
 *   arrives at a leaf would end the body as that leaf's case ended. The
 *   walker throws Repeated there, and the case does not count.
 * - A diverging body. A request whose bounds differ from the request that
 *   the tree recorded at the same position, a request where an earlier case
 *   ended, or an end where an earlier case made a request, throws Diverged.
 * - An exhausted domain. A node is exhausted when it is a leaf, or when
 *   every value that its bounds allow leads to an exhausted node. A float
 *   choice never exhausts, and neither does a sequence without a maximum
 *   size.
 *
 * The tree stops growing at NODE_LIMIT nodes. A walk that would add a node
 * past the limit stops checking for the rest of its case, and the tree no
 * longer reports an exhausted domain.
 */

import type { Observer, Request } from "./case.js";
import type { Bounds, Value } from "./choice.js";
import { bitsOf, NAN_BITS } from "./float.js";

/** The most nodes that a tree has. */
export const NODE_LIMIT = 2 ** 20;

/** How a case ended. */
export type Ending = "passed" | "failed" | "rejected";

/** The signal that stops a case whose choices repeat a tested case. */
export class Repeated extends Error {
  /** Returns the signal. */
  constructor() {
    super("prop: the case repeats a tested case");
    this.name = "Repeated";
  }
}

/**
 * The body requested different choices after the same values. recorded is
 * what the tree recorded at the position and requested is what the body did
 * there: each the bounds of a request, or undefined for a case that ended
 * at that position.
 */
export class Diverged extends Error {
  /** The position. */
  readonly index: number;
  /** The bounds that the tree recorded, or undefined for an end. */
  readonly recorded: Bounds | undefined;
  /** The bounds that the body requested, or undefined for an end. */
  readonly requested: Bounds | undefined;

  /**
   * Returns the divergence at index.
   *
   * @param index - The position.
   * @param recorded - The bounds that the tree recorded, or undefined.
   * @param requested - The bounds that the body requested, or undefined.
   */
  constructor(
    index: number,
    recorded: Bounds | undefined,
    requested: Bounds | undefined,
  ) {
    super(`prop: choice ${index} diverges`);
    this.name = "Diverged";
    this.index = index;
    this.recorded = recorded;
    this.requested = requested;
  }
}

/**
 * Reports whether the bounds allow exactly count values. A float's count is
 * never taken, and neither is that of a sequence without a maximum size.
 */
function counts(bounds: Bounds, count: number): boolean {
  if (bounds.kind === "integer") return bounds.hi - bounds.lo + 1n === BigInt(count);
  if (bounds.kind === "float" || bounds.maxSize === undefined) return false;
  // The sum of k^length over the lengths soon grows past count, so the
  // sum stops there.
  const k = BigInt(bounds.k);
  const limit = BigInt(count);
  let power = 1n;
  for (let length = 0; length < bounds.minSize; length += 1) {
    power *= k;
    if (power > limit) return false;
  }
  let total = 0n;
  for (let length = bounds.minSize; length <= bounds.maxSize; length += 1) {
    total += power;
    if (total > limit) return false;
    power *= k;
  }
  return total === limit;
}

/** Returns the key of an edge: floats by their bits, with one NaN. */
function edgeKey(value: Value): string {
  if (typeof value === "number")
    return `${Number.isNaN(value) ? NAN_BITS : bitsOf(value)}`;
  return typeof value === "bigint" ? `${value}` : value.join(",");
}

/** One position of the tree: the request made there, or the case's end. */
class Node {
  bounds: Bounds | undefined;
  ending: Ending | undefined;
  exhausted = false;
  readonly children = new Map<string, Node>();

  /**
   * Recomputes whether the node is exhausted from its children. A node on
   * the path of a case that ended is the leaf, or a node whose request the
   * case made, so it has an ending or bounds.
   */
  settle(): void {
    if (this.ending !== undefined) {
      this.exhausted = true;
      return;
    }
    this.exhausted =
      counts(this.bounds as Bounds, this.children.size) &&
      [...this.children.values()].every((child) => child.exhausted);
  }
}

/** Every case that the simplest, edge and random phases generated. */
export class Tree {
  /** The root. */
  readonly root = new Node();
  /** The nodes so far. */
  nodes = 1;
  /** The most nodes. */
  readonly limit: number;
  /** Whether a walk would have grown the tree past its limit. */
  full = false;

  /**
   * Returns a tree with a root and nothing recorded.
   *
   * @param limit - The most nodes that the tree grows to.
   */
  constructor(limit = NODE_LIMIT) {
    this.limit = limit;
  }

  /** Whether the run has tested every input of its domain. */
  get exhausted(): boolean {
    return !this.full && this.root.exhausted;
  }

  /** Returns a walker for one new case. */
  walker(): Walker {
    return new Walker(this);
  }
}

/** One case's path down the tree. It is the case's observer. */
export class Walker implements Observer {
  readonly #tree: Tree;
  readonly #path: Node[];
  #off = false;

  /**
   * Returns the walker that starts at the root of tree.
   *
   * @param tree - The tree.
   */
  constructor(tree: Tree) {
    this.#tree = tree;
    this.#path = [tree.root];
  }

  /**
   * Follows the choice at index.
   *
   * @param index - The choice's position.
   * @param request - The request.
   * @param value - The value that the request took.
   * @throws Diverged when an earlier case ended here, or made another request.
   * @throws Repeated when the choice arrives at a leaf.
   */
  step(index: number, request: Request, value: Value): void {
    if (this.#off) return;
    const node = this.#path.at(-1) as Node;
    if (node.ending !== undefined) throw new Diverged(index, undefined, request.bounds);
    if (node.bounds === undefined) node.bounds = request.bounds;
    else if (node.bounds.id !== request.bounds.id) {
      throw new Diverged(index, node.bounds, request.bounds);
    }
    const key = edgeKey(value);
    let child = node.children.get(key);
    if (child === undefined) {
      if (this.#tree.nodes >= this.#tree.limit) {
        this.#tree.full = true;
        this.#off = true;
        return;
      }
      child = new Node();
      node.children.set(key, child);
      this.#tree.nodes += 1;
    }
    if (child.ending !== undefined) throw new Repeated();
    this.#path.push(child);
  }

  /**
   * Marks where the case ended as a leaf. No case ends at an existing leaf:
   * a choice that arrives at one throws Repeated, and a root that is a leaf
   * exhausts the domain, so the run starts no further case.
   *
   * @param ending - How the case ended.
   * @throws Diverged when an earlier case made a request where this one ended.
   */
  end(ending: Ending): void {
    if (this.#off) return;
    const node = this.#path.at(-1) as Node;
    if (node.bounds !== undefined) {
      throw new Diverged(this.#path.length - 1, node.bounds, undefined);
    }
    node.ending = ending;
    for (const passed of [...this.#path].reverse()) passed.settle();
  }
}
