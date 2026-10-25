// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The anomalies of a history of transactions, and the evidence of an
 * instance of each: the edges of a cycle, or one observation of reads and
 * appends.
 */

import type { Relation } from "./cycle.js";

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
