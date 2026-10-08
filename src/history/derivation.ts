/**
 * The derivation over one history's transactions: the committed
 * transactions, the version order of each key, the dependencies between
 * committed transactions, and the first instance of each anomaly.
 *
 * The committed transactions are the ok ones, and the ones whose outcome is
 * unknown, or that are pending, whose append a committed read observed. A
 * key's version order is its longest committed read, and a key whose
 * committed reads are not prefixes of one list has no version order. Every
 * committed read is a prefix of the key's final list, so a committed append
 * that no committed read observed follows the last value of the version
 * order.
 */

import {
  components,
  type Graph,
  path,
  RELATIONS,
  type Relation,
  simple,
} from "./cycle.js";
import { identityOf } from "./history.js";
import { APPEND, READ, type Transaction } from "./transaction.js";

/** A kind of anomaly. */
export type Anomaly =
  | "garbage-read"
  | "duplicate-append"
  | "internal-inconsistency"
  | "incompatible-order"
  | "aborted-read"
  | "intermediate-read"
  | "G0"
  | "G1c"
  | "G-single"
  | "G-nonadjacent"
  | "G2";

/** The kinds of anomaly, in the order in which a record reports them. */
export const ANOMALIES: readonly Anomaly[] = [
  "garbage-read",
  "duplicate-append",
  "internal-inconsistency",
  "incompatible-order",
  "aborted-read",
  "intermediate-read",
  "G0",
  "G1c",
  "G-single",
  "G-nonadjacent",
  "G2",
];

/**
 * The evidence of one dependency of a cycle: the two transactions that it
 * joins, its relation, and the key and the values that prove it. value is a
 * value of from in the key's version order for ww, the last value of the
 * list that to read for wr, and the last value of the list that from read
 * for rw. next is the value of to that follows value in the version order,
 * for ww and rw.
 */
export interface Edge {
  /** The call of the transaction that the dependency is on. */
  readonly from: number;
  /** The call of the transaction that depends on it. */
  readonly to: number;
  /** The dependency of to on from. */
  readonly relation: Relation;
  /** The key whose list proves the dependency. */
  readonly key: unknown;
  /** The value of from, or the last value of a read. */
  readonly value: unknown;
  /** Whether the edge is an rw edge whose from read the empty list, so value states no value. */
  readonly empty: boolean;
  /** The value of to that follows value, for ww and rw. */
  readonly next: unknown;
}

/**
 * The evidence of an anomaly that is no cycle: the reads and the appends
 * that show it. Each anomaly states some fields:
 *
 * - garbage-read and duplicate-append: calls and reads of the one read, key,
 *   and value, the value at fault.
 * - internal-inconsistency: calls and reads of the one read, key, expected,
 *   whole, and future with hasFuture.
 * - incompatible-order: calls and reads of the two reads, and key.
 * - aborted-read: calls of the one read, key, value and appender.
 * - intermediate-read: calls of the one read, key, value, appender and next.
 */
export interface Observation {
  /** The anomaly that the observation shows. */
  readonly anomaly: Anomaly;
  /** The calls of the transactions that read. */
  readonly calls: readonly number[];
  /** The key that they read. */
  readonly key: unknown;
  /** The lists that they read, one for each of calls. */
  readonly reads: readonly (readonly unknown[])[];
  /** The value at fault. */
  readonly value: unknown;
  /** The call that appended value. */
  readonly appender: number | undefined;
  /** The value that appender appended to key after value. */
  readonly next: unknown;
  /** What the transaction knew of the list before the read. */
  readonly expected: readonly unknown[];
  /** Whether it knew the whole list, and false when it knew only the list's end. */
  readonly whole: boolean;
  /** The first value of the read that the transaction appends to key after the read. */
  readonly future: unknown;
  /** Whether the read states such a value. */
  readonly hasFuture: boolean;
}

/** One entry of an anomaly's explanation. */
export type Evidence = Edge | Observation;

/** One transaction of a cycle, with the relations of the edge from it to the next transaction. */
export interface Link {
  /** The call of the transaction. */
  readonly call: number;
  /** The relations of the edge to the next transaction, in the order ww, wr, rw. */
  readonly relations: readonly Relation[];
}

/**
 * One instance of an anomaly: the transactions it involves, in the order the
 * record lists them, the cycle of a cycle anomaly, and the evidence.
 */
export interface Instance {
  /** The anomaly. */
  readonly anomaly: Anomaly;
  /** The calls of the transactions that it involves. */
  readonly calls: readonly number[];
  /** The cycle, and undefined for an anomaly that is no cycle. */
  readonly cycle: readonly Link[] | undefined;
  /** An edge for each link of a cycle, or one observation. */
  readonly explanation: readonly Evidence[];
}

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

/** A committed read: the reading transaction, its key, and the list it returned. */
interface Read {
  readonly call: number;
  readonly key: unknown;
  readonly read: readonly unknown[];
}

/** A key's version order, the committed writer of each value, and the committed appends that no read observed. */
interface Versions {
  readonly key: unknown;
  readonly order: readonly unknown[];
  readonly writers: readonly (number | undefined)[];
  readonly unobserved: readonly (readonly [call: number, value: unknown])[];
}

/** A state of the G-nonadjacent search: a transaction, whether the walk entered it by an rw edge, and whether the walk has taken one. */
type State = readonly [node: number, afterRw: boolean, taken: boolean];

/** One step of a walk: the transaction it enters, and the relation of the edge it follows. */
type Step = readonly [node: number, relation: Relation];

/** Returns the identity of a key or a value that the transactions stated, which has one. */
function id(value: unknown): string {
  return identityOf(value) as string;
}

/** Returns the name of the append of value to key: their identities, compared exactly. */
function nameOf(key: unknown, value: unknown): string {
  return JSON.stringify([id(key), id(value)]);
}

/** Adds value to the list of key in map. */
function add<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** Returns the observation of an anomaly of fields, with the other fields empty. */
function observation(anomaly: Anomaly, fields: Partial<Observation>): Observation {
  return {
    anomaly,
    calls: [],
    key: undefined,
    reads: [],
    value: undefined,
    appender: undefined,
    next: undefined,
    expected: [],
    whole: false,
    future: undefined,
    hasFuture: false,
    ...fields,
  };
}

/** Returns the instance of an anomaly that is no cycle, with its evidence. */
function single(
  anomaly: Anomaly,
  calls: readonly number[],
  evidence: Observation,
): Instance {
  return { anomaly, calls, cycle: undefined, explanation: [evidence] };
}

/** Returns the evidence that following comes after value in key's version order. */
function ww(
  from: number,
  to: number,
  key: unknown,
  value: unknown,
  following: unknown,
): Edge {
  return { from, to, relation: "ww", key, value, empty: false, next: following };
}

/** Returns the values of the read at position that txn appends to the key after it. */
function future(
  txn: Transaction,
  position: number,
  read: readonly unknown[],
): unknown[] {
  const key = id((txn.mops[position] as Transaction["mops"][number]).key);
  const later = new Set(
    txn.mops
      .slice(position + 1)
      .filter((mop) => mop.fn === APPEND && id(mop.key) === key)
      .map((mop) => id(mop.value)),
  );
  return read.filter((value) => later.has(id(value)));
}

/** Reports whether a read is the expected list, or ends with it when the transaction knew only the list's end. */
function agrees(
  read: readonly unknown[],
  whole: boolean,
  expected: readonly unknown[],
): boolean {
  const got = read.map(id);
  const want = expected.map(id);
  const tail = whole ? got : got.slice(Math.max(0, got.length - want.length));
  return tail.length === want.length && tail.every((one, i) => one === want[i]);
}

/**
 * Returns the first read of an ok transaction that contradicts the
 * transaction, or undefined. Before a key's first read, the transaction
 * knows only that the key ends with its own appends. After a read, it knows
 * the whole list, and its later appends extend it. A read contains none of
 * the values that the transaction appends to the key after it.
 */
function internal(txn: Transaction): Instance | undefined {
  const known = new Map<
    string,
    readonly [whole: boolean, expected: readonly unknown[]]
  >();
  for (const [position, mop] of txn.mops.entries()) {
    const key = id(mop.key);
    const [whole, expected] = known.get(key) ?? [false, []];
    if (mop.fn === APPEND) {
      known.set(key, [whole, [...expected, mop.value]]);
      continue;
    }
    const read = mop.value as readonly unknown[];
    const later = future(txn, position, read);
    if (later.length > 0 || (known.has(key) && !agrees(read, whole, expected))) {
      return single(
        "internal-inconsistency",
        [txn.call],
        observation("internal-inconsistency", {
          calls: [txn.call],
          key: mop.key,
          reads: [read],
          expected,
          whole,
          future: later[0],
          hasFuture: later.length > 0,
        }),
      );
    }
    known.set(key, [true, [...read]]);
  }
  return undefined;
}

/**
 * Returns the longest of a key's reads, or the first two of its distinct
 * reads, shortest first, that are not prefixes of one list.
 */
function longest(
  reads: readonly Read[],
): readonly [readonly unknown[], readonly [Read, Read] | undefined] {
  const distinct = new Map<string, readonly [ids: readonly string[], read: Read]>();
  for (const one of reads) {
    const ids = one.read.map(id);
    const name = JSON.stringify(ids);
    if (!distinct.has(name)) distinct.set(name, [ids, one]);
  }
  const ranked = [...distinct.values()].sort(([a], [b]) => a.length - b.length);
  for (let i = 0; i + 1 < ranked.length; i += 1) {
    const [shorter, first] = ranked[i] as readonly [readonly string[], Read];
    const [longer, second] = ranked[i + 1] as readonly [readonly string[], Read];
    if (shorter.some((one, j) => longer[j] !== one)) return [[], [first, second]];
  }
  return [ranked.at(-1)?.[1].read ?? [], undefined];
}

/** The derivation over one history's transactions. */
export class Analysis {
  readonly #txns: readonly Transaction[];
  /** The call that appended each value to each key, by the append's name. */
  readonly #appender = new Map<string, number>();
  /** The appends to each key, as their calls and values, in the order of the transactions. */
  readonly #appends = new Map<string, [call: number, value: unknown][]>();
  /** The value that the appender of each append appended to its key after it. */
  readonly #later = new Map<string, unknown>();
  /** Each key as the history first states it, in the order the keys first appear. */
  readonly #keys = new Map<string, unknown>();
  readonly #aborted: ReadonlySet<number>;
  readonly #reads: readonly Read[];
  readonly #committed: ReadonlySet<number>;
  #incompatible: Instance | undefined;
  readonly #orders: ReadonlyMap<string, readonly unknown[]>;
  /** The evidence of each dependency, by its source and its target, in the order derived. */
  readonly #edges = new Map<string, Edge[]>();

  /**
   * Derives the dependencies between the committed transactions of txns.
   *
   * @param txns - The transactions, in the order of their invocations,
   *   whose keys and values each have a typed literal.
   */
  constructor(txns: readonly Transaction[]) {
    this.#txns = txns;
    for (const txn of txns) this.#index(txn);
    this.#aborted = new Set(
      txns.filter((txn) => txn.kind === "fail").map((txn) => txn.call),
    );
    this.#reads = txns.flatMap((txn) =>
      txn.kind === "ok"
        ? txn.mops
            .filter((mop) => mop.fn === READ)
            .map((mop) => ({
              call: txn.call,
              key: mop.key,
              read: mop.value as unknown[],
            }))
        : [],
    );
    const undecided = new Set(
      txns
        .filter((txn) => txn.kind === "unknown" || txn.kind === undefined)
        .map((txn) => txn.call),
    );
    const committed = new Set(
      txns.filter((txn) => txn.kind === "ok").map((txn) => txn.call),
    );
    for (const { key, read } of this.#reads) {
      for (const value of read) {
        const appender = this.#appender.get(nameOf(key, value));
        if (appender !== undefined && undecided.has(appender)) committed.add(appender);
      }
    }
    this.#committed = committed;
    this.#orders = this.#versionOrders();
    this.#derive();
  }

  /** Indexes the keys that txn touches, and the appends it makes. */
  #index(txn: Transaction): void {
    const last = new Map<string, string>();
    for (const mop of txn.mops) {
      const key = id(mop.key);
      if (!this.#keys.has(key)) this.#keys.set(key, mop.key);
      if (mop.fn !== APPEND) continue;
      const name = nameOf(mop.key, mop.value);
      this.#appender.set(name, txn.call);
      add(this.#appends, key, [txn.call, mop.value]);
      const before = last.get(key);
      if (before !== undefined) this.#later.set(before, mop.value);
      last.set(key, name);
    }
  }

  /**
   * Returns the first instance of an anomaly in the history, or undefined.
   *
   * @param anomaly - The kind of anomaly.
   * @returns The instance.
   */
  instance(anomaly: Anomaly): Instance | undefined {
    switch (anomaly) {
      case "garbage-read":
        return this.#garbageRead();
      case "duplicate-append":
        return this.#duplicateAppend();
      case "internal-inconsistency":
        return this.#internalInconsistency();
      case "incompatible-order":
        return this.#incompatible;
      case "aborted-read":
        return this.#abortedRead();
      case "intermediate-read":
        return this.#intermediateRead();
      case "G-nonadjacent":
        return this.#nonadjacent();
      default:
        return this.#cycle(anomaly, SEARCHES.get(anomaly) as CycleSearch);
    }
  }

  /** Returns the first committed read of a value that no transaction appended. */
  #garbageRead(): Instance | undefined {
    for (const { call, key, read } of this.#reads) {
      for (const value of read) {
        if (!this.#appender.has(nameOf(key, value))) {
          return single(
            "garbage-read",
            [call],
            observation("garbage-read", { calls: [call], key, reads: [read], value }),
          );
        }
      }
    }
    return undefined;
  }

  /** Returns the first committed read that returned one value twice. */
  #duplicateAppend(): Instance | undefined {
    for (const { call, key, read } of this.#reads) {
      const seen = new Set<string>();
      for (const value of read) {
        if (seen.has(id(value))) {
          return single(
            "duplicate-append",
            [call],
            observation("duplicate-append", {
              calls: [call],
              key,
              reads: [read],
              value,
            }),
          );
        }
        seen.add(id(value));
      }
    }
    return undefined;
  }

  /** Returns the first committed read that contradicts its own transaction. */
  #internalInconsistency(): Instance | undefined {
    for (const txn of this.#txns) {
      const found = txn.kind === "ok" ? internal(txn) : undefined;
      if (found !== undefined) return found;
    }
    return undefined;
  }

  /** Returns the first committed read of a value that an aborted call appended. */
  #abortedRead(): Instance | undefined {
    for (const { call, key, read } of this.#reads) {
      for (const value of read) {
        const appender = this.#appender.get(nameOf(key, value));
        if (appender !== undefined && this.#aborted.has(appender)) {
          return single(
            "aborted-read",
            [call, appender],
            observation("aborted-read", { calls: [call], key, value, appender }),
          );
        }
      }
    }
    return undefined;
  }

  /**
   * Returns the first committed read that ends in an append that its
   * appender followed with another. A transaction's read of its own appends
   * is no intermediate read.
   */
  #intermediateRead(): Instance | undefined {
    for (const { call, key, read } of this.#reads) {
      if (read.length === 0) continue;
      const value = read.at(-1);
      const name = nameOf(key, value);
      const appender = this.#appender.get(name);
      if (appender !== undefined && appender !== call && this.#later.has(name)) {
        return single(
          "intermediate-read",
          [call, appender],
          observation("intermediate-read", {
            calls: [call],
            key,
            value,
            appender,
            next: this.#later.get(name),
          }),
        );
      }
    }
    return undefined;
  }

  /**
   * Returns each key's version order, in the order the keys first appear,
   * and records the first key whose committed reads are not prefixes of one
   * list as the incompatible order.
   */
  #versionOrders(): Map<string, readonly unknown[]> {
    const byKey = new Map<string, Read[]>();
    for (const one of this.#reads) add(byKey, id(one.key), one);
    const orders = new Map<string, readonly unknown[]>();
    for (const [key, stated] of this.#keys) {
      const [order, clash] = longest(byKey.get(key) ?? []);
      if (clash === undefined) {
        orders.set(key, order);
      } else if (this.#incompatible === undefined) {
        const [first, second] = clash;
        this.#incompatible = single(
          "incompatible-order",
          [...new Set([first.call, second.call])],
          observation("incompatible-order", {
            calls: [first.call, second.call],
            key: stated,
            reads: [first.read, second.read],
          }),
        );
      }
    }
    return orders;
  }

  /** Returns the committed transaction that appended value to the key of identity key, or undefined. */
  #writer(key: string, value: unknown): number | undefined {
    const appender = this.#appender.get(JSON.stringify([key, id(value)]));
    return appender !== undefined && this.#committed.has(appender)
      ? appender
      : undefined;
  }

  /**
   * Derives the dependencies between committed transactions, key by key.
   * The transaction that appended the last value of a version order, and
   * every read that returned the whole order, precede each committed append
   * that no committed read observed.
   */
  #derive(): void {
    const reads = new Map<string, Read[]>();
    for (const one of this.#reads) add(reads, id(one.key), one);
    for (const [key, order] of this.#orders) {
      const present = new Set(order.map(id));
      const versions: Versions = {
        key: this.#keys.get(key),
        order,
        writers: order.map((value) => this.#writer(key, value)),
        unobserved: (this.#appends.get(key) ?? []).filter(
          ([call, value]) => this.#committed.has(call) && !present.has(id(value)),
        ),
      };
      for (let i = 0; i + 1 < order.length; i += 1) {
        this.#edge(versions.writers[i], versions.writers[i + 1], (from, to) =>
          ww(from, to, versions.key, order[i], order[i + 1]),
        );
      }
      // A key without a version order has no last writer, so #edge adds no edge.
      for (const [call, value] of versions.unobserved) {
        this.#edge(versions.writers.at(-1), call, (from, to) =>
          ww(from, to, versions.key, order.at(-1), value),
        );
      }
      for (const { call, read } of reads.get(key) ?? [])
        this.#readEdges(call, read, versions);
    }
  }

  /** Derives the write-read and the read-write dependencies of one committed read. */
  #readEdges(call: number, read: readonly unknown[], versions: Versions): void {
    const seen = read.length;
    const last = read.at(-1);
    if (seen > 0) {
      this.#edge(versions.writers[seen - 1], call, (from, to) => ({
        from,
        to,
        relation: "wr",
        key: versions.key,
        value: last,
        empty: false,
        next: undefined,
      }));
    }
    const following: readonly (readonly [number | undefined, unknown])[] =
      seen < versions.order.length
        ? [[versions.writers[seen], versions.order[seen]]]
        : versions.unobserved;
    for (const [writer, value] of following) {
      this.#edge(call, writer, (from, to) => ({
        from,
        to,
        relation: "rw",
        key: versions.key,
        value: last,
        empty: seen === 0,
        next: value,
      }));
    }
  }

  /** Adds the evidence of a dependency of b on a, when both are committed and differ. */
  #edge(
    a: number | undefined,
    b: number | undefined,
    evidence: (from: number, to: number) => Edge,
  ): void {
    if (a === undefined || b === undefined || a === b) return;
    add(this.#edges, `${a} ${b}`, evidence(a, b));
  }

  /** Returns the evidence of the edge from a to b. */
  #evidence(a: number, b: number): readonly Edge[] {
    return this.#edges.get(`${a} ${b}`) as Edge[];
  }

  /** Returns each transaction's targets over the edges of relations, in ascending order. */
  #graph(relations: ReadonlySet<Relation>): Graph {
    const out = new Map<number, number[]>();
    for (const evidence of this.#edges.values()) {
      if (evidence.some((entry) => relations.has(entry.relation))) {
        const [{ from, to }] = evidence as [Edge];
        add(out, from, to);
      }
    }
    for (const targets of out.values()) targets.sort((a, b) => a - b);
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
      if (found === undefined) continue;
      const used = [first, ...found.slice(1).map(() => search.path)];
      return this.#cycleInstance(anomaly, [a, ...found.slice(0, -1)], used);
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
          if (members.has(b) && this.#has(a, b, relation)) yield [a, b, members];
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
      const steps = this.#alternating(b, a, around, members);
      if (steps === undefined) continue;
      const nodes = [a, b, ...steps.slice(0, -1).map(([node]) => node)];
      const relations: Relation[] = ["rw", ...steps.map(([, relation]) => relation)];
      const cycle = simple(
        nodes.map((node, i) => [node, relations[i] as Relation] as const),
      );
      if (cycle.filter(([, relation]) => relation === "rw").length < NONADJACENT_RW)
        continue;
      return this.#cycleInstance(
        "G-nonadjacent",
        cycle.map(([node]) => node),
        cycle.map(([, relation]) =>
          relation === "rw" ? new Set<Relation>(["rw"]) : NON_RW,
        ),
      );
    }
    return undefined;
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
    for (let at = 0; at < queue.length; at += 1) {
      const state = queue[at] as State;
      const [node, afterRw, taken] = state;
      if (node === goal && !afterRw && taken) return walkTo(state, parent);
      for (const [following, relation] of this.#successors(state, around, members)) {
        if (parent.has(String(following))) continue;
        parent.set(String(following), [state, relation]);
        queue.push(following);
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
    current = previous[0];
    previous = parent.get(String(current));
  }
  return steps.reverse();
}
