// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The dependencies between the committed transactions of a register
 * history.
 *
 * The initial value precedes each installed value, the value of a committed
 * transaction's last write of a register. A committed transaction's external
 * read, its first read of a register before its write, precedes the value
 * that the transaction installs. Blind writes do not reveal an order between
 * them, so the derivation orders only these pairs.
 */

import type { Edge } from "./anomaly.js";
import { id, same } from "./reads.js";
import { READ, type Transaction, WRITE } from "./transaction.js";

/** A version pair of a register: a value, the transaction that installed a later value, and that value. The empty list is the initial value. */
type Pair = readonly [before: readonly unknown[], call: number, value: unknown];

/** An external read of a register: the reading transaction, and the list of the value that it read. */
type ExternalRead = readonly [call: number, read: readonly unknown[]];

/** The evidence of a dependency of to on from. */
type Evidence = (from: number, to: number) => Edge;

/** Adds value to the list of key in map. */
function add<V>(map: Map<string, V[]>, key: string, value: V): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

/**
 * Returns the external reads of an ok register transaction by key: the
 * list of the first read of each key that the transaction reads before it
 * writes the key.
 */
function externalReads(txn: Transaction): Map<string, readonly unknown[]> {
  const touched = new Set<string>();
  const found = new Map<string, readonly unknown[]>();
  for (const mop of txn.kind === "ok" ? txn.mops : []) {
    const key = id(mop.key);
    if (mop.fn === READ && !touched.has(key)) {
      found.set(key, mop.value as readonly unknown[]);
    }
    touched.add(key);
  }
  return found;
}

/** Returns the value of the last write of each key of a register transaction. */
function externalWrites(txn: Transaction): Map<string, unknown> {
  return new Map(
    txn.mops.filter((mop) => mop.fn === WRITE).map((mop) => [id(mop.key), mop.value]),
  );
}

/** Returns the evidence of a dependency of a register, which the history states as key. */
function evidenceOf(
  key: unknown,
  relation: Edge["relation"],
  value: readonly unknown[],
  next: unknown,
): Evidence {
  return (from, to) => ({
    from,
    to,
    relation,
    key,
    value: value[0],
    empty: value.length === 0,
    next,
    register: true,
  });
}

/**
 * Returns the edges of one register from its version pairs and its external
 * reads. A dependency on a value that no committed transaction installed,
 * and a dependency of a transaction on itself, have no edge.
 */
function edgesOf(
  key: string,
  stated: unknown,
  pairs: readonly Pair[],
  reads: readonly ExternalRead[],
  installer: (key: string, value: unknown) => number | undefined,
): Edge[] {
  const found: Edge[] = [];
  const depend = (from: number | undefined, to: number, edge: Evidence): void => {
    if (from !== undefined && from !== to) {
      found.push(edge(from, to));
    }
  };
  for (const [before, call, value] of pairs.filter(([one]) => one.length > 0)) {
    depend(installer(key, before[0]), call, evidenceOf(stated, "ww", before, value));
  }
  for (const [reader, read] of reads) {
    if (read.length > 0) {
      depend(
        installer(key, read[0]),
        reader,
        evidenceOf(stated, "wr", read, undefined),
      );
    }
    for (const [, call, value] of pairs.filter(([before]) => same(before, read))) {
      depend(reader, call, evidenceOf(stated, "rw", read, value));
    }
  }
  return found;
}

/**
 * Returns the edges between the committed transactions of a register
 * history, by their source and their target as "a b". A pair of a value and
 * a later value gives a ww edge from the transaction that installed the
 * first value, and an rw edge from each transaction whose external read
 * returned it. An external read of a value other than the initial value
 * gives a wr edge from the transaction that installed the value. The
 * installer of a value is the committed transaction that wrote it, unless
 * that transaction wrote the key again later. A key gives its ww edges in
 * the order of the pairs, and then the wr and the rw edges of each read in
 * the order of the reading transactions.
 *
 * @param txns - The transactions, in the order of their invocations.
 * @param committed - The calls of the committed transactions.
 * @param keys - Each key by its identity, as the history first states it,
 *   in the order the keys first appear.
 * @param later - The value that the writer of each write wrote to its key
 *   after it, by the name of the write.
 * @param writers - The call that wrote each value to each key, by the name
 *   of the write.
 * @returns The edges of each pair of transactions, in the order derived.
 */
export function registerEdges(
  txns: readonly Transaction[],
  committed: ReadonlySet<number>,
  keys: ReadonlyMap<string, unknown>,
  later: ReadonlyMap<string, unknown>,
  writers: ReadonlyMap<string, number>,
): Map<string, Edge[]> {
  const installer = (key: string, value: unknown): number | undefined => {
    const name = JSON.stringify([key, id(value)]);
    const writer = writers.get(name);
    return later.has(name) || writer === undefined || !committed.has(writer)
      ? undefined
      : writer;
  };
  const reads = new Map<string, ExternalRead[]>();
  const installs = new Map<string, (readonly [call: number, value: unknown])[]>();
  for (const txn of txns.filter((one) => committed.has(one.call))) {
    for (const [key, read] of externalReads(txn)) {
      add(reads, key, [txn.call, read]);
    }
    for (const [key, value] of externalWrites(txn)) {
      add(installs, key, [txn.call, value]);
    }
  }
  const edges = new Map<string, Edge[]>();
  for (const [key, stated] of keys) {
    const keyReads = reads.get(key) ?? [];
    const readBy = new Map(keyReads);
    const pairs = (installs.get(key) ?? []).flatMap(([call, value]): Pair[] => {
      const before = readBy.get(call) ?? [];
      return before.length > 0
        ? [
            [[], call, value],
            [before, call, value],
          ]
        : [[[], call, value]];
    });
    for (const edge of edgesOf(key, stated, pairs, keyReads, installer)) {
      add(edges, `${edge.from} ${edge.to}`, edge);
    }
  }
  return edges;
}
