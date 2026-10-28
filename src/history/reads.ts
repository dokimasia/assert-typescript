// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The anomalies that the reads of a history show without a cycle: a read of
 * a value that no transaction appended, a value read twice, a read that
 * contradicts its own transaction, a read of an aborted append, and a read
 * of an intermediate append.
 */

import type { Anomaly, Instance, Observation } from "./anomaly.js";
import { identityOf } from "./history.js";
import { APPEND, READ, type Transaction, WRITE } from "./transaction.js";

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
    if (mop.fn === READ) {
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
    } else {
      known.set(key, [whole, [...expected, mop.value]]);
    }
  }
  return undefined;
}

/**
 * Returns the first register read of an ok transaction that contradicts the
 * transaction, or undefined. After a write or a read of a key, the
 * transaction knows the key's value. A later read returns that value, and
 * no read returns a value that the transaction writes to the key after the
 * read.
 */
function internalRegister(txn: Transaction): Instance | undefined {
  const known = new Map<string, readonly unknown[]>();
  for (const [position, mop] of txn.mops.entries()) {
    const key = id(mop.key);
    const isRead = mop.fn === READ;
    const read = isRead ? (mop.value as readonly unknown[]) : [mop.value];
    const writesLater =
      isRead &&
      read.length > 0 &&
      txn.mops
        .slice(position + 1)
        .some(
          (later) =>
            later.fn === WRITE && id(later.key) === key && same([later.value], read),
        );
    const expected = known.get(key);
    if (writesLater || (isRead && expected !== undefined && !same(expected, read))) {
      return single(
        "internal-inconsistency",
        [txn.call],
        observation("internal-inconsistency", {
          calls: [txn.call],
          key: mop.key,
          register: true,
          read: read[0],
          known: expected?.[0],
          whole: expected !== undefined,
          future: writesLater ? read[0] : undefined,
          hasFuture: writesLater,
        }),
      );
    }
    known.set(key, read);
  }
  return undefined;
}

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

/** Returns the first committed read that contradicts its own transaction. */
export function internalInconsistency(facts: Facts): Instance | undefined {
  const contradicted = facts.register ? internalRegister : internal;
  for (const txn of facts.txns) {
    const found = txn.kind === "ok" ? contradicted(txn) : undefined;
    if (found !== undefined) {
      return found;
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
