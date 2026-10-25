// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The dependencies between the committed transactions of a history, and the
 * search for the first cycle of each kind among them.
 */

import type { Anomaly, Edge, Instance, Link } from "./anomaly.js";
import {
  components,
  type Graph,
  path,
  RELATIONS,
  type Relation,
  simple,
} from "./cycle.js";

/** How the search of one kind of cycle finds it. */
interface CycleSearch {
  /** The relations of the components that the search takes. */
  readonly component: ReadonlySet<Relation>;
  /** The relation of the edges that the search tries as the closing edge. */
  readonly closing: Relation;
  /** The relations of the path from the closing edge's target back to its source. */
  readonly path: ReadonlySet<Relation>;
}

/** Every relation. */
const ALL: ReadonlySet<Relation> = new Set(RELATIONS);

/** The relations other than a read-write dependency. */
const NON_RW: ReadonlySet<Relation> = new Set(["ww", "wr"]);

/** The search of each kind of cycle but G-nonadjacent. */
const SEARCHES: ReadonlyMap<Anomaly, CycleSearch> = new Map<Anomaly, CycleSearch>([
  ["G0", { component: new Set(["ww"]), closing: "ww", path: new Set(["ww"]) }],
  ["G1c", { component: NON_RW, closing: "wr", path: NON_RW }],
  ["G-single", { component: ALL, closing: "rw", path: NON_RW }],
  ["G2", { component: ALL, closing: "rw", path: ALL }],
]);

/** The fewest read-write edges of a G-nonadjacent cycle. A cycle with one is G-single. */
const NONADJACENT_RW = 2;

/** A state of the G-nonadjacent search: a transaction, whether the walk entered it by an rw edge, and whether the walk has taken one. */
type State = readonly [node: number, afterRw: boolean, taken: boolean];

/** One step of a walk: the transaction it enters, and the relation of the edge it follows. */
type Step = readonly [node: number, relation: Relation];

/** Returns the steps of the walk to state: each transaction, and the edge into it. */
function walkTo(
  state: State,
  parent: ReadonlyMap<string, readonly [State, Relation] | undefined>,
): Step[] {
  const steps: Step[] = [];
  let current = state;
  let previous = parent.get(String(current));
  while (previous !== undefined) {
    steps.push([current[0], previous[1]]);
    [current] = previous;
    previous = parent.get(String(current));
  }
  return steps.reverse();
}

/** The dependencies between the committed transactions of a history, with the evidence of each. */
export class Dependencies {
  /** The evidence of each dependency, by its source and its target, in the order derived. */
  readonly #edges: ReadonlyMap<string, readonly Edge[]>;
  readonly #committed: ReadonlySet<number>;

  /**
   * Returns the dependencies of the committed transactions.
   *
   * @param edges - The evidence of each dependency, by its source and its
   *   target as "a b", in the order derived.
   * @param committed - The calls of the committed transactions.
   */
  constructor(
    edges: ReadonlyMap<string, readonly Edge[]>,
    committed: ReadonlySet<number>,
  ) {
    this.#edges = edges;
    this.#committed = committed;
  }

  /**
   * Returns the first cycle of a kind, or undefined.
   *
   * @param anomaly - G0, G1c, G-single, G-nonadjacent or G2.
   * @returns The instance.
   */
  instance(anomaly: Anomaly): Instance | undefined {
    if (anomaly === "G-nonadjacent") {
      return this.#nonadjacent();
    }
    return this.#cycle(anomaly, SEARCHES.get(anomaly) as CycleSearch);
  }

  /** Returns the evidence of the edge from a to b. */
  #evidence(a: number, b: number): readonly Edge[] {
    return this.#edges.get(`${a} ${b}`) as readonly Edge[];
  }

  /** Returns each transaction's targets over the edges of relations, in ascending order. */
  #graph(relations: ReadonlySet<Relation>): Graph {
    const out = new Map<number, number[]>();
    for (const evidence of this.#edges.values()) {
      if (evidence.some((entry) => relations.has(entry.relation))) {
        const [{ from, to }] = evidence as readonly [Edge];
        out.set(from, [...(out.get(from) ?? []), to]);
      }
    }
    for (const targets of out.values()) {
      targets.sort((a, b) => a - b);
    }
    return out;
  }

  /** Reports whether the edge from a to b has a relation. */
  #has(a: number, b: number, relation: Relation): boolean {
    return this.#evidence(a, b).some((entry) => entry.relation === relation);
  }

  /** Returns the committed transactions in ascending order. */
  #nodes(): number[] {
    return [...this.#committed].sort((a, b) => a - b);
  }

  /**
   * Returns the first cycle of a kind, as the kind's search finds it, or
   * undefined. The search takes the components of the graph over the
   * component relations. In each, it tries the edges of the closing relation
   * in the order of their sources and then their targets. An edge closes a
   * cycle when a path over the path relations leads from its target back to
   * its source. The closing edge of a G-single cycle counts as its one
   * read-write dependency.
   */
  #cycle(anomaly: Anomaly, search: CycleSearch): Instance | undefined {
    const around = this.#graph(search.component);
    const back = this.#graph(search.path);
    const first =
      anomaly === "G-single" ? new Set<Relation>([search.closing]) : search.component;
    for (const [a, b, members] of this.#closing(around, search.closing)) {
      const found = path(b, a, back, members);
      if (found !== undefined) {
        const used = [first, ...found.slice(1).map(() => search.path)];
        return this.#cycleInstance(anomaly, [a, ...found.slice(0, -1)], used);
      }
    }
    return undefined;
  }

  /**
   * Yields each edge of a relation inside a component of around, with the
   * component's transactions. The edges come in the order of the
   * components, then of their sources, then of their targets. Every
   * transaction of a component has an edge to another one.
   */
  *#closing(
    around: Graph,
    relation: Relation,
  ): Generator<readonly [a: number, b: number, members: ReadonlySet<number>]> {
    for (const component of components(this.#nodes(), around)) {
      const members = new Set(component);
      for (const a of component) {
        for (const b of around.get(a) as readonly number[]) {
          if (members.has(b) && this.#has(a, b, relation)) {
            yield [a, b, members];
          }
        }
      }
    }
  }

  /**
   * Returns the first G-nonadjacent cycle, or undefined. The search tries
   * each component's rw edges in the order of their sources and then their
   * targets. From an edge's target it takes the shortest walk back to the
   * edge's source on which no rw edge follows another, that takes one more
   * rw edge at least, and whose last edge is no rw edge. It reduces the
   * closed walk to a simple cycle with no two adjacent rw edges, and reports
   * that cycle when it has two rw edges or more.
   */
  #nonadjacent(): Instance | undefined {
    const around = this.#graph(ALL);
    for (const [a, b, members] of this.#closing(around, "rw")) {
      const found = this.#nonadjacentAt(a, b, around, members);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Returns the G-nonadjacent cycle that the rw edge from a to b closes, or
   * undefined: the simple cycle of the shortest alternating walk from b
   * back to a, when that cycle has two rw edges or more.
   */
  #nonadjacentAt(
    a: number,
    b: number,
    around: Graph,
    members: ReadonlySet<number>,
  ): Instance | undefined {
    const steps = this.#alternating(b, a, around, members);
    if (steps === undefined) {
      return undefined;
    }
    const nodes = [a, b, ...steps.slice(0, -1).map(([node]) => node)];
    const relations: Relation[] = ["rw", ...steps.map(([, relation]) => relation)];
    const cycle = simple(
      nodes.map((node, i) => [node, relations[i] as Relation] as const),
    );
    if (cycle.filter(([, relation]) => relation === "rw").length < NONADJACENT_RW) {
      return undefined;
    }
    return this.#cycleInstance(
      "G-nonadjacent",
      cycle.map(([node]) => node),
      cycle.map(([, relation]) =>
        relation === "rw" ? new Set<Relation>(["rw"]) : NON_RW,
      ),
    );
  }

  /**
   * Returns the shortest alternating walk from start to goal, or undefined.
   * An rw edge leads into start. The search tries each transaction's edges
   * in the order of their targets and of the relations.
   */
  #alternating(
    start: number,
    goal: number,
    around: Graph,
    members: ReadonlySet<number>,
  ): Step[] | undefined {
    const origin: State = [start, true, false];
    const parent = new Map<string, readonly [State, Relation] | undefined>([
      [String(origin), undefined],
    ]);
    const queue: State[] = [origin];
    // The iterator of an array reads its length at each step, so the loop
    // visits each state that the loop appends.
    for (const state of queue) {
      const [node, afterRw, taken] = state;
      if (node === goal && !afterRw && taken) {
        return walkTo(state, parent);
      }
      for (const [following, relation] of this.#successors(state, around, members)) {
        if (!parent.has(String(following))) {
          parent.set(String(following), [state, relation]);
          queue.push(following);
        }
      }
    }
    return undefined;
  }

  /**
   * Returns the states that follow state on an alternating walk inside
   * members, each with the relation of its edge, in the order of the targets
   * and of the relations. An rw edge never follows an rw edge. members are
   * the transactions of a component of around, so each has an edge.
   */
  #successors(
    state: State,
    around: Graph,
    members: ReadonlySet<number>,
  ): (readonly [State, Relation])[] {
    const [node, afterRw, taken] = state;
    return (around.get(node) as readonly number[])
      .filter((target) => members.has(target))
      .flatMap((target) =>
        this.#relations(node, target)
          .filter((relation) => relation !== "rw" || !afterRw)
          .map((relation): readonly [State, Relation] => {
            const rw = relation === "rw";
            return [[target, rw, taken || rw], relation];
          }),
      );
  }

  /** Returns the relations of the edge from a to b, in relation order. */
  #relations(a: number, b: number): Relation[] {
    const present = new Set(this.#evidence(a, b).map((entry) => entry.relation));
    return RELATIONS.filter((relation) => present.has(relation));
  }

  /**
   * Returns the instance of a cycle through nodes in order, back to the
   * first. used gives, for the edge from each transaction to the next, the
   * relations the search followed it by. The cycle lists the edge's
   * relations among them, and the explanation the first evidence of one.
   */
  #cycleInstance(
    anomaly: Anomaly,
    nodes: readonly number[],
    used: readonly ReadonlySet<Relation>[],
  ): Instance {
    const cycle: Link[] = [];
    const explanation: Edge[] = [];
    nodes.forEach((node, position) => {
      const following = nodes[(position + 1) % nodes.length] as number;
      const evidence = this.#evidence(node, following).filter((entry) =>
        (used[position] as ReadonlySet<Relation>).has(entry.relation),
      );
      const relations = new Set(evidence.map((entry) => entry.relation));
      cycle.push({
        call: node,
        relations: RELATIONS.filter((one) => relations.has(one)),
      });
      explanation.push(evidence[0] as Edge);
    });
    return { anomaly, calls: nodes, cycle, explanation };
  }
}
