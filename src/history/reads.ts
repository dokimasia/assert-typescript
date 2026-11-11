// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The facts of the reads of a history, and the anomalies that the reads
 * show without a cycle: a read of a value that no transaction appended, a
 * value read twice, a read of an aborted append, a read of an intermediate
 * append, and two updates of one version of a key.
 */

import type { Anomaly, Instance, Observation } from "./anomaly.js";
import { identityOf } from "./history.js";
import { type Mop, READ, type Transaction } from "./transaction.js";

/** What the transactions of a history state, as the search of an anomaly of a read reads it. */
export interface Facts {
  /** Whether the history is a register history. */
  readonly register: boolean;
  /** The transactions, in the order of their invocations. */
  readonly txns: readonly Transaction[];
  /** The committed reads, in the order of the transactions. */
  readonly reads: readonly Read[];
  /** The call that appended each value to each key, by the append's name. */
  readonly appender: ReadonlyMap<string, number>;
  /** The value that the appender of each append appended to its key after it, by the append's name. */
  readonly later: ReadonlyMap<string, unknown>;
  /** The calls of the aborted transactions. */
  readonly aborted: ReadonlySet<number>;
}

/** A committed read: the reading transaction, its key, and the list it returned. */
export interface Read {
  readonly call: number;
  readonly key: unknown;
  readonly read: readonly unknown[];
}

/** Adds value to the list of key in map. */
export function add<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

/** Reports whether two register reads, each the list of its one value or the empty list, are one. */
export function same(a: readonly unknown[], b: readonly unknown[]): boolean {
  return JSON.stringify(a.map(id)) === JSON.stringify(b.map(id));
}

/** Returns the identity of a key or a value that the transactions stated, which has one. */
export function id(value: unknown): string {
  return identityOf(value) as string;
}

/** Returns the name of the append of value to key: their identities, compared exactly. */
export function nameOf(key: unknown, value: unknown): string {
  return JSON.stringify([id(key), id(value)]);
}

/** Returns the observation of an anomaly of fields, with the other fields empty. */
export function observation(
  anomaly: Anomaly,
  fields: Partial<Observation>,
): Observation {
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
    register: false,
    read: undefined,
    known: undefined,
    ...fields,
  };
}

/** Returns the instance of an anomaly that is no cycle, with its evidence. */
export function single(
  anomaly: Anomaly,
  calls: readonly number[],
  evidence: Observation,
): Instance {
  return { anomaly, calls, cycle: undefined, explanation: [evidence] };
}

/** Returns the first committed read of a value that no transaction appended. */
export function garbageRead(facts: Facts): Instance | undefined {
  for (const { call, key, read } of facts.reads) {
    for (const value of read) {
      if (!facts.appender.has(nameOf(key, value))) {
        return single(
          "garbage-read",
          [call],
          observation("garbage-read", {
            calls: [call],
            key,
            reads: [read],
            value,
            register: facts.register,
            read: facts.register ? value : undefined,
          }),
        );
      }
    }
  }
  return undefined;
}

/** Returns the first committed read that returned one value twice. */
export function duplicateAppend(facts: Facts): Instance | undefined {
  for (const { call, key, read } of facts.reads) {
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

/** Returns the first committed read of a value that an aborted call appended. */
export function abortedRead(facts: Facts): Instance | undefined {
  for (const { call, key, read } of facts.reads) {
    for (const value of read) {
      const appender = facts.appender.get(nameOf(key, value));
      if (appender !== undefined && facts.aborted.has(appender)) {
        return single(
          "aborted-read",
          [call, appender],
          observation("aborted-read", {
            calls: [call],
            key,
            value,
            appender,
            register: facts.register,
          }),
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
export function intermediateRead(facts: Facts): Instance | undefined {
  for (const { call, key, read } of facts.reads.filter((one) => one.read.length > 0)) {
    const value = read.at(-1);
    const name = nameOf(key, value);
    const appender = facts.appender.get(name);
    if (appender !== undefined && appender !== call && facts.later.has(name)) {
      return single(
        "intermediate-read",
        [call, appender],
        observation("intermediate-read", {
          calls: [call],
          key,
          value,
          appender,
          next: facts.later.get(name),
          register: facts.register,
        }),
      );
    }
  }
  return undefined;
}

/**
 * Returns each read of txn that is the first micro-operation of txn on its
 * key, in the order of the micro-operations.
 */
export function firstReads(txn: Transaction): Mop[] {
  const touched = new Set<string>();
  const found: Mop[] = [];
  for (const mop of txn.mops) {
    const key = id(mop.key);
    if (mop.fn === READ && !touched.has(key)) {
      found.push(mop);
    }
    touched.add(key);
  }
  return found;
}

/**
 * Returns the first two ok transactions that both update one version of a
 * key that they read. Each transaction reads the key with its first
 * micro-operation on the key, and appends or writes to the key after the
 * read. Both reads returned the same list or value. The second transaction
 * is the first one whose read matches the read of an earlier transaction.
 */
export function lostUpdate(facts: Facts): Instance | undefined {
  const readers = new Map<string, number>();
  for (const txn of facts.txns.filter((one) => one.kind === "ok")) {
    const written = new Set(
      txn.mops.filter((mop) => mop.fn !== READ).map((mop) => id(mop.key)),
    );
    for (const mop of firstReads(txn).filter((one) => written.has(id(one.key)))) {
      const read = mop.value as readonly unknown[];
      const name = JSON.stringify([id(mop.key), read.map(id)]);
      const first = readers.get(name);
      if (first !== undefined) {
        return single(
          "lost-update",
          [first, txn.call],
          observation("lost-update", {
            calls: [first, txn.call],
            key: mop.key,
            reads: [read],
            register: facts.register,
            read: facts.register ? read[0] : undefined,
          }),
        );
      }
      readers.set(name, txn.call);
    }
  }
  return undefined;
}
