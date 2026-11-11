// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The internal consistency of the reads of a transaction: a read returns
 * what the transaction's own earlier micro-operations on the key imply.
 */

import type { Instance } from "./anomaly.js";
import { type Facts, id, observation, same, single } from "./reads.js";
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
