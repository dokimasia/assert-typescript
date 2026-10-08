/**
 * The searches of the dependency graph of committed transactions: its
 * strongly connected components, the shortest path within one, and the
 * reduction of a closed walk to a simple cycle.
 *
 * A graph is the targets of each transaction, in ascending order, so every
 * search visits the edges of a transaction in the order of their targets.
 */

/** A dependency of one committed transaction on another. */
export type Relation = "ww" | "wr" | "rw";

/** The relations in the order in which a cycle's entry lists them. */
export const RELATIONS: readonly Relation[] = ["ww", "wr", "rw"];

/** The targets of each transaction, in ascending order. */
export type Graph = ReadonlyMap<number, readonly number[]>;

/** A closed walk: each transaction, and the relation of the edge that leaves it. */
export type Walk = readonly (readonly [node: number, relation: Relation])[];

/**
 * Returns the strongly connected components of two or more transactions, by
 * Tarjan's algorithm without recursion. Each component lists its
 * transactions in ascending order, and the components come in the order of
 * their lowest transactions.
 *
 * @param nodes - The transactions, in the order the search visits them.
 * @param graph - The edges.
 * @returns The components.
 */
export function components(nodes: readonly number[], graph: Graph): number[][] {
  const order = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  // The transactions whose edges the search is visiting, each with the
  // position of its next edge.
  const work: [node: number, next: number][] = [];
  const found: number[][] = [];
  const lower = (node: number, value: number): void => {
    low.set(node, Math.min(low.get(node) as number, value));
  };
  const enter = (node: number): void => {
    order.set(node, order.size);
    low.set(node, order.size - 1);
    stack.push(node);
    onStack.add(node);
    work.push([node, 0]);
  };
  const leave = (node: number): void => {
    work.pop();
    const parent = work.at(-1);
    if (parent !== undefined) lower(parent[0], low.get(node) as number);
    if (low.get(node) !== order.get(node)) return;
    const component = stack.splice(stack.indexOf(node));
    for (const member of component) onStack.delete(member);
    if (component.length > 1) found.push(component.sort((a, b) => a - b));
  };
  for (const root of nodes) {
    if (!order.has(root)) enter(root);
    while (work.length > 0) {
      const top = work.at(-1) as [number, number];
      const [node, next] = top;
      const target = graph.get(node)?.[next];
      top[1] = next + 1;
      if (target === undefined) leave(node);
      else if (!order.has(target)) enter(target);
      else if (onStack.has(target)) lower(node, order.get(target) as number);
    }
  }
  return found.sort((a, b) => (a[0] as number) - (b[0] as number));
}

/**
 * Returns the shortest path from start to goal within members, or
 * undefined. Of two shortest paths it returns the one that comes first in
 * the order of the targets.
 *
 * @param start - The first transaction.
 * @param goal - The last transaction.
 * @param graph - The edges.
 * @param members - The transactions that the path may visit.
 * @returns The transactions of the path, from start to goal.
 */
export function path(
  start: number,
  goal: number,
  graph: Graph,
  members: ReadonlySet<number>,
): number[] | undefined {
  const parent = new Map<number, number>([[start, start]]);
  const queue = [start];
  for (let at = 0; at < queue.length; at += 1) {
    let node = queue[at] as number;
    if (node === goal) {
      const found = [node];
      while (node !== start) {
        node = parent.get(node) as number;
        found.push(node);
      }
      return found.reverse();
    }
    for (const target of graph.get(node) ?? []) {
      if (members.has(target) && !parent.has(target)) {
        parent.set(target, node);
        queue.push(target);
      }
    }
  }
  return undefined;
}

/** Returns the two positions of the first transaction that the walk visits twice. */
function firstRepeat(walk: Walk): [number, number] | undefined {
  const seen = new Map<number, number>();
  for (const [position, [node]] of walk.entries()) {
    const first = seen.get(node);
    if (first !== undefined) return [first, position];
    seen.set(node, position);
  }
  return undefined;
}

/**
 * Reports whether no read-write edge of a closed walk follows another.
 *
 * @param walk - The closed walk.
 * @returns Whether the walk alternates.
 */
export function alternates(walk: Walk): boolean {
  return !walk.some(
    ([, relation], i) =>
      relation === "rw" && (walk[(i + 1) % walk.length] as Walk[number])[1] === "rw",
  );
}

/**
 * Returns a simple cycle of a closed walk with no two adjacent read-write
 * edges. While a transaction occurs twice, the walk splits at the first
 * repeat into the part between the two occurrences and the rest. It keeps
 * the part between them when that part alternates, and the rest otherwise.
 * The cycle starts at its first read-write edge.
 *
 * @param walk - The closed walk, which has no two adjacent read-write edges.
 * @returns The cycle.
 */
export function simple(walk: Walk): Walk {
  let current = walk;
  for (
    let repeat = firstRepeat(current);
    repeat !== undefined;
    repeat = firstRepeat(current)
  ) {
    const [first, second] = repeat;
    const inner = current.slice(first, second);
    current = alternates(inner)
      ? inner
      : [...current.slice(0, first), ...current.slice(second)];
  }
  const start = Math.max(
    0,
    current.findIndex(([, relation]) => relation === "rw"),
  );
  return [...current.slice(start), ...current.slice(0, start)];
}
