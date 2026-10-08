/**
 * The calls of a history as a check of linearizability reads them, and
 * their partitions.
 *
 * The check removes every call that failed. Two calls that share a key are
 * in one partition, and a call that declares no key touches every key, so it
 * puts the whole history into one partition. Partitions come in the order of
 * their first invocation.
 */

import { detail as literalOf } from "../record/literal.js";
import type { Event } from "./event.js";
import { CallOperation, type Operation } from "./spec.js";

/** A call of a history as the record of a check states it: the call from its invocation to its completion. */
export interface Span {
  /** The index of the call's invocation event. */
  readonly call: number;
  /** The index of the call's completion event, and undefined for a pending call. */
  readonly completion: number | undefined;
  /** The process that made the call. */
  readonly process: number;
  /** The call as the spec sees it. */
  readonly operation: Operation;
}

/** A call that a check reads: its span, its keys, and the identity of each key. */
export interface Checked {
  /** The call's span. */
  readonly span: Span;
  /** The keys that the call touches, and none for every key. */
  readonly keys: readonly unknown[];
  /** The identities of the keys. */
  readonly ids: readonly string[];
}

/** Calls that share keys, which the check searches on their own. */
export interface Partition {
  /** The keys of the calls, each once, in the order the history first declares them, and none for every key. */
  readonly keys: readonly unknown[];
  /** The calls, in event order. */
  readonly calls: readonly Checked[];
}

/**
 * Returns the calls of a history in event order, without the calls that
 * failed. A call is known when it completed as ok.
 *
 * @param events - The events of the history.
 * @param ids - The identities of the keys of each event.
 * @returns The calls.
 */
export function callsOf(
  events: readonly Event[],
  ids: readonly (readonly string[])[],
): Checked[] {
  const completions = new Map<number, Event>();
  for (const event of events) {
    if (event.kind !== "invoke") completions.set(event.call, event);
  }
  const calls: Checked[] = [];
  for (const event of events) {
    if (event.kind !== "invoke") continue;
    const completion = completions.get(event.index);
    if (completion?.kind === "fail") continue;
    const known = completion?.kind === "ok";
    const output = known ? (completion as { output: unknown }).output : undefined;
    calls.push({
      span: {
        call: event.index,
        completion: completion?.index,
        process: event.process,
        operation: new CallOperation(event.operation, event.args, known, output),
      },
      keys: event.keys,
      ids: ids[event.index] as readonly string[],
    });
  }
  return calls;
}

/** Returns the representative of the partition of the call at position, halving the path to it. */
function root(parent: number[], position: number): number {
  let at = position;
  while (parent[at] !== at) {
    parent[at] = parent[parent[at] as number] as number;
    at = parent[at] as number;
  }
  return at;
}

/** Returns the keys that calls declare, each once, in the order first declared. */
function keysOf(calls: readonly Checked[]): unknown[] {
  const seen = new Map<string, unknown>();
  for (const call of calls) {
    call.ids.forEach((id, i) => {
      if (!seen.has(id)) seen.set(id, call.keys[i]);
    });
  }
  return [...seen.values()];
}

/**
 * Returns the partitions of calls, in the order of their first invocation.
 *
 * @param calls - The calls, in event order.
 * @returns The partitions.
 */
export function partitionsOf(calls: readonly Checked[]): Partition[] {
  if (calls.length === 0) return [];
  if (calls.some((call) => call.ids.length === 0)) return [{ keys: [], calls }];
  const parent = calls.map((_, position) => position);
  const first = new Map<string, number>();
  calls.forEach((call, position) => {
    for (const id of call.ids) {
      const other = first.get(id) ?? position;
      first.set(id, other);
      parent[root(parent, position)] = root(parent, other);
    }
  });
  const groups = new Map<number, Checked[]>();
  calls.forEach((call, position) => {
    const group = root(parent, position);
    const members = groups.get(group);
    if (members === undefined) groups.set(group, [call]);
    else members.push(call);
  });
  return [...groups.values()].map((group) => ({ keys: keysOf(group), calls: group }));
}

/**
 * Returns the most calls that are open at one event. A call is open from its
 * invocation to its completion, and a call that is not known is open to the
 * end of the history.
 *
 * @param calls - The calls.
 * @returns The most open calls.
 */
export function concurrency(calls: readonly Checked[]): number {
  const changes: [event: number, change: number][] = [];
  for (const { span } of calls) {
    changes.push([span.call, 1]);
    if (span.operation.known) changes.push([span.completion as number, -1]);
  }
  changes.sort(([a], [b]) => a - b);
  let open = 0;
  let most = 0;
  for (const [, change] of changes) {
    open += change;
    most = Math.max(most, open);
  }
  return most;
}

/**
 * Returns a span in the history's JSON form: the call, the completion, the
 * process, the operation, the args as typed literals, and the output as a
 * typed literal. A pending call states no completion, and a call that is not
 * known states no output.
 *
 * @param span - The span.
 * @returns The JSON value.
 */
export function spanJson(span: Span): Record<string, unknown> {
  const op = span.operation;
  return {
    call: span.call,
    ...(span.completion === undefined ? {} : { completion: span.completion }),
    process: span.process,
    operation: op.name,
    args: op.args.map(literalOf),
    ...(op.known ? { output: literalOf(op.output) } : {}),
  };
}
