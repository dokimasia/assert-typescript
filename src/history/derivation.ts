// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

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
 * order. A register history has no version orders, and its writes are its
 * appends.
 */

import type { Anomaly, Edge, Instance } from "./anomaly.js";
import { Dependencies } from "./dependencies.js";
import {
  abortedRead,
  duplicateAppend,
  type Facts,
  garbageRead,
  id,
  intermediateRead,
  internalInconsistency,
  nameOf,
  observation,
  type Read,
  single,
} from "./reads.js";
import { registerEdges } from "./registers.js";
import { READ, type Transaction } from "./transaction.js";

/** A key's version order, the committed writer of each value, and the committed appends that no read observed. */
interface Versions {
  readonly key: unknown;
  readonly order: readonly unknown[];
  readonly writers: readonly (number | undefined)[];
  readonly unobserved: readonly (readonly [call: number, value: unknown])[];
}

/** Adds value to the list of key in map. */
function add<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

/** Returns the evidence that next comes after value in key's version order. */
function ww(
  from: number,
  to: number,
  key: unknown,
  value: unknown,
  next: unknown,
): Edge {
  return { from, to, relation: "ww", key, value, empty: false, next, register: false };
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
    if (!distinct.has(name)) {
      distinct.set(name, [ids, one]);
    }
  }
  const ranked = [...distinct.values()].sort(([a], [b]) => a.length - b.length);
  for (let i = 0; i + 1 < ranked.length; i += 1) {
    const [shorter, first] = ranked[i] as readonly [readonly string[], Read];
    const [longer, second] = ranked[i + 1] as readonly [readonly string[], Read];
    if (shorter.some((one, j) => longer[j] !== one)) {
      return [[], [first, second]];
    }
  }
  return [ranked.at(-1)?.[1].read ?? [], undefined];
}

/** The derivation over one history's transactions. */
export class Analysis {
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
  /** The evidence of each dependency, by its source and its target, in the order derived. */
  readonly #edges: Map<string, Edge[]>;
  readonly #facts: Facts;
  readonly #dependencies: Dependencies;

  /**
   * Derives the dependencies between the committed transactions of txns.
   *
   * @param txns - The transactions, in the order of their invocations,
   *   whose keys and values each have a typed literal.
   * @param register - True for a register history.
   */
  constructor(txns: readonly Transaction[], register = false) {
    for (const txn of txns) {
      this.#index(txn);
    }
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
        if (appender !== undefined && undecided.has(appender)) {
          committed.add(appender);
        }
      }
    }
    this.#committed = committed;
    this.#edges = register
      ? registerEdges(txns, committed, this.#keys, this.#later, this.#appender)
      : new Map();
    this.#derive(register ? new Map() : this.#versionOrders());
    this.#facts = {
      register,
      txns,
      reads: this.#reads,
      appender: this.#appender,
      later: this.#later,
      aborted: this.#aborted,
    };
    this.#dependencies = new Dependencies(this.#edges, committed);
  }

  /** Indexes the keys that txn touches, and the appends it makes. */
  #index(txn: Transaction): void {
    const last = new Map<string, string>();
    for (const mop of txn.mops) {
      const key = id(mop.key);
      if (!this.#keys.has(key)) {
        this.#keys.set(key, mop.key);
      }
      if (mop.fn !== READ) {
        const name = nameOf(mop.key, mop.value);
        this.#appender.set(name, txn.call);
        add(this.#appends, key, [txn.call, mop.value]);
        const before = last.get(key);
        if (before !== undefined) {
          this.#later.set(before, mop.value);
        }
        last.set(key, name);
      }
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
        return garbageRead(this.#facts);
      case "duplicate-append":
        return duplicateAppend(this.#facts);
      case "internal-inconsistency":
        return internalInconsistency(this.#facts);
      case "incompatible-order":
        return this.#incompatible;
      case "aborted-read":
        return abortedRead(this.#facts);
      case "intermediate-read":
        return intermediateRead(this.#facts);
      default:
        return this.#dependencies.instance(anomaly);
    }
  }

  /**
   * Returns each key's version order, in the order the keys first appear,
   * and records the first key whose committed reads are not prefixes of one
   * list as the incompatible order.
   */
  #versionOrders(): Map<string, readonly unknown[]> {
    const byKey = new Map<string, Read[]>();
    for (const one of this.#reads) {
      add(byKey, id(one.key), one);
    }
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
   * Derives the dependencies between committed transactions from orders,
   * key by key. The transaction that appended the last value of a version
   * order, and every read that returned the whole order, precede each
   * committed append that no committed read observed.
   */
  #derive(orders: ReadonlyMap<string, readonly unknown[]>): void {
    const reads = new Map<string, Read[]>();
    for (const one of this.#reads) {
      add(reads, id(one.key), one);
    }
    for (const [key, order] of orders) {
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
      for (const { call, read } of reads.get(key) ?? []) {
        this.#readEdges(call, read, versions);
      }
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
        register: false,
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
        register: false,
      }));
    }
  }

  /** Adds the evidence of a dependency of b on a, when both are committed and differ. */
  #edge(
    a: number | undefined,
    b: number | undefined,
    evidence: (from: number, to: number) => Edge,
  ): void {
    if (a === undefined || b === undefined || a === b) {
      return;
    }
    add(this.#edges, `${a} ${b}`, evidence(a, b));
  }
}
