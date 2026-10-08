/**
 * The checks that the list-append transactions of a history exhibit no
 * anomaly that an isolation level forbids.
 *
 * A check first reads the micro-operations for the six anomalies that need
 * no dependency graph. It then derives the write-write, write-read and
 * read-write dependencies between committed transactions, and searches the
 * graph for the five kinds of cycle. A level forbids a set of the eleven
 * kinds, and the record reports the first of them that the history
 * exhibits.
 */

import { callSite, Failure } from "../failure.js";
import { ofOperation } from "../matcher/fault.js";
import { Mode, type Seat } from "../matcher/seat.js";
import { Running } from "../matcher/verdict.js";
import { detail as literalOf } from "../record/literal.js";
import {
  ANOMALIES,
  Analysis,
  type Anomaly,
  type Edge,
  type Evidence,
  type Instance,
  type Link,
  type Observation,
} from "./derivation.js";
import { History } from "./history.js";
import { type Transaction, transactionJson, transactions } from "./transaction.js";

/** The assertion of a check of serializability. */
export const SERIALIZABLE = "serializable";

/** The assertion of a check of snapshot isolation. */
export const SNAPSHOT_ISOLATION = "snapshot-isolation";

/** An isolation level, which the assertion of the same id checks. */
export type Level = typeof SERIALIZABLE | typeof SNAPSHOT_ISOLATION;

/**
 * The kinds that each level forbids. Snapshot isolation permits a cycle in
 * which two read-write dependencies are adjacent, such as a write skew.
 */
const FORBIDS: Readonly<Record<Level, readonly Anomaly[]>> = {
  [SERIALIZABLE]: ANOMALIES,
  [SNAPSHOT_ISOLATION]: ANOMALIES.filter((kind) => kind !== "G2"),
};

/** The detail of the record of a failing isolation check: the five fields of the definition. */
export interface IsolationDetail {
  /** The first kind that the level forbids and the history exhibits. */
  readonly anomaly: Anomaly;
  /** Every kind that the level forbids and the history exhibits, in report order. */
  readonly kinds: readonly Anomaly[];
  /** The transactions that the anomaly involves. */
  readonly transactions: readonly Transaction[];
  /** The cycle of a cycle anomaly, and null for any other. */
  readonly cycle: readonly Link[] | null;
  /** The evidence of the anomaly: an edge for each link of a cycle, or one observation. */
  readonly explanation: readonly Evidence[];
}

/**
 * Returns the detail of the check of a history's events at a level, or
 * undefined for a history that exhibits no anomaly that the level forbids.
 *
 * @param events - The events of the history.
 * @param level - The isolation level.
 * @returns The detail.
 * @throws TransactionError for a history that is no history of list-append
 *   transactions.
 */
export function checkIsolation(
  events: Parameters<typeof transactions>[0],
  level: Level,
): IsolationDetail | undefined {
  const txns = transactions(events);
  const analysis = new Analysis(txns);
  const found = FORBIDS[level]
    .map((kind) => [kind, analysis.instance(kind)] as const)
    .filter((pair): pair is readonly [Anomaly, Instance] => pair[1] !== undefined);
  const first = found[0]?.[1];
  if (first === undefined) return undefined;
  const byCall = new Map(txns.map((txn) => [txn.call, txn]));
  return {
    anomaly: first.anomaly,
    kinds: found.map(([kind]) => kind),
    transactions: first.calls.map((call) => byCall.get(call) as Transaction),
    cycle: first.cycle ?? null,
    explanation: first.explanation,
  };
}

/** Returns an edge of a cycle as the explanation of a record states it. */
function edgeJson(edge: Edge): Record<string, unknown> {
  return {
    from: edge.from,
    to: edge.to,
    relation: edge.relation,
    key: literalOf(edge.key),
    value: edge.empty ? null : literalOf(edge.value),
    ...(edge.relation === "wr" ? {} : { next: literalOf(edge.next) }),
  };
}

/** Returns an observation as the explanation of a record states it: the fields that its anomaly states. */
function observationJson(o: Observation): Record<string, unknown> {
  const key = literalOf(o.key);
  switch (o.anomaly) {
    case "internal-inconsistency":
      return {
        call: o.calls[0],
        key,
        read: literalOf(o.reads[0]),
        expected: literalOf(o.expected),
        whole: o.whole,
        future: o.hasFuture ? literalOf(o.future) : null,
      };
    case "incompatible-order":
      return { calls: o.calls, key, reads: o.reads.map(literalOf) };
    case "aborted-read":
      return { call: o.calls[0], key, value: literalOf(o.value), appender: o.appender };
    case "intermediate-read":
      return {
        call: o.calls[0],
        key,
        value: literalOf(o.value),
        appender: o.appender,
        next: literalOf(o.next),
      };
    default:
      return {
        call: o.calls[0],
        key,
        read: literalOf(o.reads[0]),
        value: literalOf(o.value),
      };
  }
}

/**
 * Returns one entry of an explanation as a record states it.
 *
 * @param evidence - The entry.
 * @returns The JSON value.
 */
export function evidenceJson(evidence: Evidence): Record<string, unknown> {
  return "relation" in evidence ? edgeJson(evidence) : observationJson(evidence);
}

/**
 * Returns the detail of a failing isolation check as its call record states
 * it: the kinds by their spellings, each transaction in the history's JSON
 * form, null for the cycle of an anomaly that is no cycle, and each entry of
 * the explanation with its values as typed literals.
 *
 * @param detail - The detail.
 * @returns The JSON value.
 */
export function isolationJson(detail: IsolationDetail): Record<string, unknown> {
  return {
    anomaly: detail.anomaly,
    kinds: [...detail.kinds],
    transactions: detail.transactions.map(transactionJson),
    cycle:
      detail.cycle?.map((link) => ({ ...link, relations: [...link.relations] })) ??
      null,
    explanation: detail.explanation.map(evidenceJson),
  };
}

/** Checks history at level, and reports the verdict of the assertion of the level, whose faults name op. */
function isolated(
  seat: Seat,
  history: History,
  msg: string,
  level: Level,
  op: string,
): void {
  seat.helper();
  const run = Running.of(seat);
  if (!(history instanceof History)) {
    run.fault(Mode.Fatal, level, msg, ofOperation(op, "the history is no History"));
    return;
  }
  let detail: IsolationDetail | undefined;
  try {
    detail = checkIsolation(history.events(), level);
  } catch (err) {
    run.fault(Mode.Fatal, level, msg, ofOperation(op, err));
    return;
  }
  if (detail === undefined) {
    run.pass(Mode.Fatal, level, msg);
    return;
  }
  run.failRun(
    Mode.Fatal,
    new Failure(level, msg, { ...detail }, callSite()),
    isolationJson(detail),
  );
}

/**
 * Checks that the list-append transactions of history exhibit no anomaly
 * that serializability forbids, among the dependencies that their reads
 * reveal, and fails the seat with one record of the assertion serializable
 * when they do. Serializability forbids every kind of anomaly.
 *
 * A transaction is a call of the operation "txn" whose arguments are its
 * micro-operations, each an array of three parts: "append", a key and a
 * value, or "read", a key and null. An ok completion commits the
 * transaction, and its output is an array that repeats the
 * micro-operations with each read's list, or null for the empty list. A
 * fail completion aborts it. A transaction whose outcome is unknown, or
 * that is pending, is committed when a committed read observed one of its
 * appends. Every value is appended to its key once. Keys and values compare
 * by their typed literals.
 *
 * The record's detail states the five fields of the definition: anomaly,
 * kinds, transactions, cycle and explanation. A history that is no
 * History, and a history whose calls are no list-append transactions, end
 * the call with a fault.
 *
 * @param seat - Where the failure is reported.
 * @param history - The history.
 * @param msg - The contract under test.
 */
export function isSerializable(seat: Seat, history: History, msg: string): void {
  isolated(seat, history, msg, SERIALIZABLE, "history.isSerializable");
}

/**
 * Checks that the list-append transactions of history exhibit no anomaly
 * that snapshot isolation forbids, among the dependencies that their reads
 * reveal, and fails the seat with one record of the assertion
 * snapshot-isolation when they do. Snapshot isolation forbids every kind of
 * anomaly but G2: it permits a cycle in which two read-write dependencies
 * are adjacent, such as a write skew.
 *
 * The workload, the derivation, the record and the faults are those of
 * isSerializable.
 *
 * @param seat - Where the failure is reported.
 * @param history - The history.
 * @param msg - The contract under test.
 */
export function hasSnapshotIsolation(seat: Seat, history: History, msg: string): void {
  isolated(seat, history, msg, SNAPSHOT_ISOLATION, "history.hasSnapshotIsolation");
}
